#!/usr/bin/env python3
"""Local SportsGang QA environment for hands-on testing.

    npm run qa:up [-- --mode simulator|device] [-- --no-open]
    npm run qa:status
    npm run qa:seed
    npm run qa:open
    npm run qa:restart               # restart API + Metro on the current code
    npm run qa:down
    npm run qa:reset -- --yes        # QA database only: drop, migrate, reseed

Everything this tool owns is local and identifiable:
  * One Docker Compose project (scripts/qa/compose.qa.yml), by default the
    shared `sportsgang-qa`: PostgreSQL with the named volume
    `<project>_pgdata` and Redis, both bound to 127.0.0.1. `down` stops them
    and keeps the volume.
  * The API (uvicorn) and Metro (Expo, for Expo Go) processes it starts,
    tracked in .qa/state.json by pid, process group, start time, full
    command line and working directory.
  * .qa/ (git-ignored): config.env (project, ports, generated secrets),
    credentials and fixture manifest from the seeder, cached tokens, logs.

Ownership (fails closed):
  * A project has exactly one owner: the worktree + .qa/config.env that
    claimed it, recorded machine-wide in ~/.sportsgang-qa/<project>.json
    (override with SPORTSGANG_QA_HOME). Every command that changes the stack
    (up, seed, stop-api, restart, down, reset) refuses unless this worktree
    and config are the owner; it holds ~/.sportsgang-qa/<project>.lock while
    it runs. Another worktree that wants its own stack sets QA_PROJECT (and
    free ports) in its .qa/config.env — a separate, isolated instance.
  * Containers that already exist without an owner record are adopted only
    when they were created from this worktree's compose file with this
    config's database password; anything else is refused. A volume with no
    containers and no owner record is refused (ownership cannot be proven).
  * Before any signal the recorded process must still be the same process:
    same pid, process group, start time, command line and cwd. A mismatch
    (pid reuse, another program, another worktree) is never signalled;
    down/restart/stop-api/reset then refuse and change nothing.

The API always runs with APP_ENV=local, a generated SECRET_KEY, blank
provider keys and this stack's database; the mobile app is started with
EXPO_PUBLIC_API_URL pointing at this API (127.0.0.1 for the simulator, the
Mac's private LAN address for a physical phone), and `status` reads the URL
back from the manifest Metro actually serves.

Stdlib only (the seeder runs inside apps/api's uv environment).
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import ipaddress
import json
import os
import re
import secrets
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_PROJECT = "sportsgang-qa"
DEFAULT_PORTS = {"QA_API_PORT": 8130, "QA_METRO_PORT": 8190, "QA_PG_PORT": 55470, "QA_REDIS_PORT": 56470}
DB_NAME = "sportsgang_qa"
PROJECT_NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$")
# The port a recorded API/Metro command line serves; 8130 never matches 81300.
PORT_ARG = re.compile(r"--port (\d+)(?:\s|$)")


def configure(root: Path) -> None:
    """Point every path at one worktree (tests use a temporary one)."""
    global ROOT, QA, CONFIG, STATE, LOGS, COMPOSE_FILE, API_DIR, MOBILE_DIR
    ROOT = root.resolve()
    QA = ROOT / ".qa"
    CONFIG = QA / "config.env"
    STATE = QA / "state.json"
    LOGS = QA / "logs"
    COMPOSE_FILE = ROOT / "scripts/qa/compose.qa.yml"
    API_DIR = ROOT / "apps/api"
    MOBILE_DIR = ROOT / "apps/mobile"


configure(Path(__file__).resolve().parents[2])

# Processes this invocation started, so it can reap them while it waits.
_spawned: dict[int, subprocess.Popen] = {}


# ─── small helpers ──────────────────────────────────────────────────────────


def say(msg: str) -> None:
    print(f"[qa] {msg}", flush=True)


def fail(msg: str, code: int = 1) -> None:
    print(f"[qa] ERROR: {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


def run(cmd: list[str], cwd: Path | None = None, env: dict | None = None, check: bool = True, capture: bool = False):
    result = subprocess.run(cmd, cwd=cwd or ROOT, env=env, text=True, capture_output=capture)
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[-800:] if capture else ""
        fail(f"command failed ({result.returncode}): {' '.join(cmd)}\n{detail}")
    return result


def private(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    os.chmod(path, 0o600)


def read_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def write_env(values: dict[str, str]) -> None:
    lines = ["# Generated by scripts/qa/qa.py — local QA only, never commit."]
    lines += [f"{k}={v}" for k, v in values.items()]
    private(CONFIG, "\n".join(lines) + "\n")


def load_state() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(state: dict) -> None:
    private(STATE, json.dumps(state, indent=2) + "\n")


def port_free(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
        except OSError:
            return False
    # Also refuse ports something answers on (e.g. bound to another interface).
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) != 0


def http_get(url: str, headers: dict | None = None, timeout: float = 5.0) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as e:
        return 0, str(e)


def lan_ip() -> str | None:
    for iface in ("en0", "en1"):
        r = subprocess.run(["ipconfig", "getifaddr", iface], capture_output=True, text=True)
        ip = r.stdout.strip()
        if ip:
            try:
                if ipaddress.ip_address(ip).is_private:
                    return ip
            except ValueError:
                pass
    return None


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def source_sha() -> str:
    return git("rev-parse", "HEAD").stdout.strip()


def dirty(paths: tuple[str, ...] = ("apps", "packages", "scripts")) -> bool:
    return bool(git("status", "--porcelain", "--", *paths).stdout.strip())


# ─── configuration ──────────────────────────────────────────────────────────


def ensure_config() -> dict[str, str]:
    cfg = read_env(CONFIG)
    changed = False
    if "QA_PROJECT" not in cfg:
        cfg["QA_PROJECT"] = DEFAULT_PROJECT
        changed = True
    if not PROJECT_NAME.match(cfg["QA_PROJECT"]):
        fail(f"QA_PROJECT={cfg['QA_PROJECT']!r} is not a valid Compose project name")
    for key, default in DEFAULT_PORTS.items():
        if key not in cfg:
            cfg[key] = str(default)
            changed = True
    if "QA_PG_PASSWORD" not in cfg:
        cfg["QA_PG_PASSWORD"] = secrets.token_hex(16)
        changed = True
    if "QA_SECRET_KEY" not in cfg:
        cfg["QA_SECRET_KEY"] = secrets.token_hex(32)
        changed = True
    if changed or not CONFIG.exists():
        write_env(cfg)
    os.chmod(QA, 0o700)
    return cfg


def pick_port(cfg: dict[str, str], key: str) -> None:
    """Keep the configured port when free; otherwise move to the next free one."""
    port = int(cfg[key])
    if port_free(port):
        return
    for candidate in range(port + 1, port + 40):
        if port_free(candidate):
            say(f"port {port} for {key} is used by something else; using {candidate}")
            cfg[key] = str(candidate)
            write_env(cfg)
            return
    fail(f"no free port near {port} for {key}")


def api_env(cfg: dict[str, str]) -> dict[str, str]:
    """Explicit environment for the API: nothing inherited except PATH/HOME/locale."""
    base = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "LC_ALL", "USER", "TMPDIR") if k in os.environ}
    pw = cfg["QA_PG_PASSWORD"]
    return {
        **base,
        "APP_ENV": "local",
        "SECRET_KEY": cfg["QA_SECRET_KEY"],
        "POSTGRES_URL": f"postgresql://sportsgang_qa:{pw}@127.0.0.1:{cfg['QA_PG_PORT']}/{DB_NAME}",
        "REDIS_URL": f"redis://127.0.0.1:{cfg['QA_REDIS_PORT']}/0",
        "MEDIA_ROOT": str(QA / "media"),
        "CORS_ORIGINS": "",
        # Providers stay off in the QA stack.
        "GOOGLE_PLACES_API_KEY": "",
        "GOOGLE_CLIENT_ID": "",
        "GOOGLE_CLIENT_SECRET": "",
        "APPLE_CLIENT_ID": "",
        "APPLE_TEAM_ID": "",
        "APPLE_KEY_ID": "",
        "APPLE_PRIVATE_KEY": "",
        "FIELD_ENCRYPTION_KEY": "",
        "INTERNAL_API_TOKEN": "",
        "EXPO_PUSH_URL": "http://127.0.0.1:9/disabled-in-qa",
        "PYTHONUNBUFFERED": "1",
    }


def api_host(mode: str) -> str:
    if mode == "simulator":
        return "127.0.0.1"
    ip = lan_ip()
    if not ip:
        fail("no private LAN address found for device mode (is Wi-Fi connected?)")
    return ip


def mobile_api_url(cfg: dict[str, str], mode: str) -> str:
    return f"http://{api_host(mode)}:{cfg['QA_API_PORT']}"


# ─── ownership: project, owner record, lock ─────────────────────────────────


def owners_dir() -> Path:
    return Path(os.environ.get("SPORTSGANG_QA_HOME") or Path.home() / ".sportsgang-qa")


def owner_path(cfg: dict[str, str]) -> Path:
    return owners_dir() / f"{cfg['QA_PROJECT']}.json"


def config_id(cfg: dict[str, str]) -> str:
    """Identity of the config that owns a project: derived from its database
    password (the volume is initialised with it), never the password itself."""
    return hashlib.sha256(f"{cfg['QA_PROJECT']}\0{cfg['QA_PG_PASSWORD']}".encode()).hexdigest()[:16]


def read_owner(cfg: dict[str, str]) -> dict | None:
    path = owner_path(cfg)
    return json.loads(path.read_text()) if path.exists() else None


def volume_name(cfg: dict[str, str]) -> str:
    return f"{cfg['QA_PROJECT']}_pgdata"


def project_containers(cfg: dict[str, str]) -> list[dict]:
    r = subprocess.run(
        ["docker", "ps", "-a", "-q", "--filter", f"label=com.docker.compose.project={cfg['QA_PROJECT']}"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        fail(f"cannot list Docker containers: {r.stderr.strip()[-300:]}")
    ids = r.stdout.split()
    if not ids:
        return []
    r = subprocess.run(["docker", "inspect", *ids], capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"cannot inspect Docker containers: {r.stderr.strip()[-300:]}")
    out = []
    for c in json.loads(r.stdout):
        labels = c.get("Config", {}).get("Labels") or {}
        env = dict(e.split("=", 1) for e in c.get("Config", {}).get("Env") or [] if "=" in e)
        out.append(
            {
                "id": c["Id"][:12],
                "service": labels.get("com.docker.compose.service"),
                "config_files": labels.get("com.docker.compose.project.config_files"),
                "running": bool(c.get("State", {}).get("Running")),
                "pg_password": env.get("POSTGRES_PASSWORD"),
            }
        )
    return out


def container_mismatch(cfg: dict[str, str], containers: list[dict]) -> list[str]:
    reasons = []
    for c in containers:
        if c["config_files"] != str(COMPOSE_FILE):
            reasons.append(f"container {c['id']} ({c['service']}) was created from {c['config_files']}")
        if c["service"] == "postgres" and c["pg_password"] != cfg["QA_PG_PASSWORD"]:
            reasons.append(f"postgres container {c['id']} was created with a different QA_PG_PASSWORD")
    return reasons


def volume_exists(cfg: dict[str, str]) -> bool:
    return subprocess.run(["docker", "volume", "inspect", volume_name(cfg)], capture_output=True).returncode == 0


def ownership(cfg: dict[str, str]) -> tuple[str, str]:
    """('owned' | 'adoptable' | 'unclaimed' | 'conflict', detail). Read-only."""
    project = cfg["QA_PROJECT"]
    record = read_owner(cfg)
    containers = project_containers(cfg)
    mismatch = container_mismatch(cfg, containers)
    if record:
        if record.get("worktree") != str(ROOT):
            gone = "" if Path(record.get("worktree", "")).exists() else " (that path no longer exists)"
            return "conflict", (
                f"project {project} is owned by {record.get('worktree')}{gone}; run QA from there, or set "
                f"QA_PROJECT and free ports in {CONFIG} for a separate instance"
            )
        if record.get("config_id") != config_id(cfg):
            return "conflict", f"{CONFIG} is not the config that claimed project {project} (was it regenerated?)"
        if mismatch:
            return "conflict", "; ".join(mismatch)
        return "owned", f"project {project} owned by this worktree ({record.get('how')} {record.get('claimed_at')})"
    if containers:
        if mismatch:
            return "conflict", "; ".join(mismatch) + f" — project {project} has no owner record"
        return "adoptable", f"project {project} containers were created by this worktree's config; `up` adopts them"
    if volume_exists(cfg):
        return "conflict", (
            f"volume {volume_name(cfg)} exists with no containers and no owner record; its ownership cannot be "
            "proven, so it is left alone"
        )
    return "unclaimed", f"project {project} has no containers or volume yet"


def claim(cfg: dict[str, str]) -> None:
    """Become (or confirm being) the owner of the project, or exit without changing anything."""
    state, detail = ownership(cfg)
    if state == "conflict":
        fail(f"refusing: {detail}")
    if state == "owned":
        return
    record = {
        "project": cfg["QA_PROJECT"],
        "worktree": str(ROOT),
        "config_id": config_id(cfg),
        "volume": volume_name(cfg),
        "how": "adopted" if state == "adoptable" else "created",
        "claimed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    owners_dir().mkdir(parents=True, exist_ok=True)
    os.chmod(owners_dir(), 0o700)
    try:
        fd = os.open(owner_path(cfg), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        fail(f"refusing: another worktree claimed project {cfg['QA_PROJECT']} meanwhile")
    with os.fdopen(fd, "w") as f:
        f.write(json.dumps(record, indent=2) + "\n")
    say(f"{record['how']} project {cfg['QA_PROJECT']} for this worktree ({owner_path(cfg)})")


@contextlib.contextmanager
def project_lock(cfg: dict[str, str]):
    """One stack-changing command per project at a time, across worktrees."""
    owners_dir().mkdir(parents=True, exist_ok=True)
    os.chmod(owners_dir(), 0o700)
    with open(owners_dir() / f"{cfg['QA_PROJECT']}.lock", "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fail(f"another qa command is changing project {cfg['QA_PROJECT']}; try again when it finishes")
        yield


# ─── process identity ───────────────────────────────────────────────────────

# Fixed locale so `lstart` always has one format; the system time zone applies.
_C_ENV = {"LC_ALL": "C", "PATH": os.environ.get("PATH", "/usr/bin:/bin")}


def proc_cwd(pid: int) -> str | None:
    link = Path(f"/proc/{pid}/cwd")
    if link.exists():
        try:
            return str(Path(os.readlink(link)).resolve())
        except OSError:
            return None
    r = subprocess.run(["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"], capture_output=True, text=True, env=_C_ENV)
    for line in r.stdout.splitlines():
        if line.startswith("n"):
            return str(Path(line[1:]).resolve())
    return None


def proc_identity(pid: int) -> dict | None:
    """What the OS says pid is now: process group, start time, command line, cwd."""
    r = subprocess.run(
        ["ps", "-ww", "-o", "pid=,pgid=,lstart=,command=", "-p", str(pid)], capture_output=True, text=True, env=_C_ENV
    )
    parts = r.stdout.split()
    if r.returncode != 0 or len(parts) < 8 or parts[0] != str(pid):
        return None
    return {
        "pgid": int(parts[1]),
        "lstart": " ".join(parts[2:7]),
        "command": " ".join(parts[7:]),
        "cwd": proc_cwd(pid),
    }


_IDENTITY_KEYS = ("pgid", "lstart", "command", "cwd")


def _legacy_reasons(entry: dict, actual: dict) -> list[str]:
    """A pre-identity record (pid/cmd/cwd/started_at only) is accepted only on
    every available fact: own process group, cwd, launched command (npx
    retitles itself `npm exec`), and start time within 5 s of the record."""
    reasons = []
    cmd = entry.get("cmd", "")
    if actual["pgid"] != entry["pid"]:
        reasons.append(f"process group {actual['pgid']} is not its own")
    if actual["cwd"] != str(Path(entry.get("cwd", "/nonexistent")).resolve()):
        reasons.append(f"cwd {actual['cwd']} (recorded {entry.get('cwd')})")
    if actual["command"] not in {cmd, cmd.replace("npx --no-install ", "npm exec ", 1)}:
        reasons.append(f"command {actual['command']!r} (recorded {cmd!r})")
    try:
        started = time.mktime(time.strptime(actual["lstart"], "%a %b %d %H:%M:%S %Y"))
        recorded = datetime.fromisoformat(entry["started_at"]).timestamp()
        if abs(started - recorded) > 5:
            reasons.append(f"started {actual['lstart']} (recorded {entry['started_at']})")
    except (KeyError, ValueError):
        reasons.append("start time cannot be compared")
    return reasons


def check_proc(entry: dict | None) -> tuple[str, str]:
    """('running' | 'legacy' | 'gone' | 'foreign', detail) for a recorded process."""
    if not entry or not isinstance(entry.get("pid"), int):
        return "gone", "not recorded"
    pid = entry["pid"]
    actual = proc_identity(pid)
    if actual is None:
        return "gone", f"pid {pid} is not running"
    if "lstart" not in entry:
        reasons = _legacy_reasons(entry, actual)
        if reasons:
            return "foreign", f"pid {pid} does not match its legacy record: " + "; ".join(reasons)
        return "legacy", f"pid {pid} matches its legacy record"
    diffs = [f"{k} {actual[k]!r} (recorded {entry.get(k)!r})" for k in _IDENTITY_KEYS if actual[k] != entry.get(k)]
    if entry.get("pgid") != pid:
        diffs.append("recorded process group is not its own")
    if diffs:
        return "foreign", f"pid {pid} is not the recorded process: " + "; ".join(diffs)
    return "running", f"pid {pid} identity verified"


def adopt_legacy(state: dict) -> None:
    """Upgrade verified legacy records in place (no signal is sent)."""
    for name in ("api", "metro"):
        entry = state.get(name)
        if check_proc(entry)[0] == "legacy":
            entry.update(proc_identity(entry["pid"]) or {})
            say(f"adopted running {name} pid {entry['pid']} (identity verified, record upgraded)")
            save_state(state)


def refuse_foreign(state: dict, names: tuple[str, ...]) -> None:
    """Before a command that signals, make sure every target is ours or gone."""
    problems = []
    for name in names:
        status_, detail = check_proc(state.get(name))
        if status_ in ("foreign", "legacy"):
            problems.append(f"{name}: {detail}")
    if problems:
        fail(
            "refusing; nothing was stopped. "
            + " | ".join(problems)
            + f". If the recorded process is gone and its pid reused, remove that entry from {STATE}."
        )


def _group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _reap(pid: int) -> None:
    proc = _spawned.get(pid)
    if proc is not None and proc.poll() is not None:
        _spawned.pop(pid, None)


def _wait_group_exit(pid: int, pgid: int, seconds: float) -> bool:
    deadline = time.time() + seconds
    while True:
        _reap(pid)
        if pid not in _spawned and not _group_alive(pgid):
            return True
        if time.time() >= deadline:
            return False
        time.sleep(0.2)


def stop_proc(entry: dict | None, name: str) -> None:
    status_, detail = check_proc(entry)
    if status_ == "gone":
        return
    if status_ != "running":
        fail(f"refusing to stop {name}: {detail}")
    pid, pgid = entry["pid"], entry["pgid"]
    os.killpg(pgid, signal.SIGTERM)
    if _wait_group_exit(pid, pgid, 10):
        say(f"stopped {name} (pid {pid})")
        return
    # Escalate only for the same group: the leader still verifies, or it has
    # exited and its group id stays reserved while members remain.
    if check_proc(entry)[0] in ("running", "gone") and _group_alive(pgid):
        os.killpg(pgid, signal.SIGKILL)
        if _wait_group_exit(pid, pgid, 5):
            say(f"killed {name} (pid {pid}) after it ignored SIGTERM")
            return
    fail(f"{name} (pid {pid}) did not exit; nothing further was signalled")


def _abandon_spawned(pid: int) -> None:
    """Cleanup for a process this run started (its unreaped pid cannot be reused)."""
    proc = _spawned.get(pid)
    if proc is None:
        return
    if proc.poll() is None:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(pid, signal.SIGTERM)
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(pid, signal.SIGKILL)
            proc.wait(5)
    _wait_group_exit(pid, pid, 5)


def start_detached(name: str, cmd: list[str], cwd: Path, env: dict) -> dict:
    LOGS.mkdir(parents=True, exist_ok=True)
    log = open(LOGS / f"{name}.log", "a")
    log.write(f"\n===== {datetime.now(timezone.utc).isoformat()} {' '.join(cmd)}\n")
    log.flush()
    # A new session keeps the process alive after this terminal (or agent)
    # exits, and makes it its own process-group leader (pgid == pid).
    proc = subprocess.Popen(
        cmd, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True
    )
    _spawned[proc.pid] = proc
    return {
        "pid": proc.pid,
        "cmd": " ".join(cmd),
        "log": str(LOGS / f"{name}.log"),
        "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_sha": source_sha(),
        "source_dirty": dirty(),
    }


def record_identity(entry: dict) -> None:
    """After readiness (Metro retitles itself on start), pin what the process is."""
    actual = proc_identity(entry["pid"])
    if actual is None or actual["pgid"] != entry["pid"]:
        fail(f"process {entry['pid']} exited or left its process group before it could be recorded")
    entry.update(actual)


# ─── stack steps ────────────────────────────────────────────────────────────


def compose(cfg: dict[str, str], *args: str, capture: bool = False, check: bool = True):
    cmd = ["docker", "compose", "-p", cfg["QA_PROJECT"], "-f", str(COMPOSE_FILE), "--env-file", str(CONFIG), *args]
    return run(cmd, capture=capture, check=check)


def containers_running(cfg: dict[str, str]) -> bool:
    r = compose(cfg, "ps", "--status", "running", "-q", capture=True, check=False)
    return len([x for x in r.stdout.split() if x]) >= 2


def ensure_containers(cfg: dict[str, str]) -> bool:
    if containers_running(cfg):
        return False
    pick_port(cfg, "QA_PG_PORT")
    pick_port(cfg, "QA_REDIS_PORT")
    say(f"starting PostgreSQL and Redis (project {cfg['QA_PROJECT']})")
    compose(cfg, "up", "-d", "--wait")
    return True


def migrate(cfg: dict[str, str]) -> None:
    run(["uv", "run", "--frozen", "alembic", "upgrade", "head"], cwd=API_DIR, env=api_env(cfg), capture=True)
    current = run(["uv", "run", "--frozen", "alembic", "current"], cwd=API_DIR, env=api_env(cfg), capture=True)
    say(f"database {DB_NAME} at migration {current.stdout.strip() or '?'}")


def wait_http(url: str, ok, seconds: float, what: str, pid: int | None = None) -> str:
    deadline = time.time() + seconds
    last = ""
    while time.time() < deadline:
        code, body = http_get(url)
        if code and ok(code, body):
            return body
        last = f"{code} {body[:120]}"
        proc = _spawned.get(pid) if pid is not None else None
        if proc is not None and proc.poll() is not None:
            fail(f"{what} exited during startup (code {proc.returncode}); see {LOGS}")
        time.sleep(1)
    fail(f"{what} not ready at {url} ({last})")
    return ""


def api_command(cfg: dict[str, str], host: str) -> list[str]:
    return ["uv", "run", "--frozen", "uvicorn", "app.main:app", "--host", host, "--port", cfg["QA_API_PORT"]]


def metro_command(cfg: dict[str, str], mode: str) -> list[str]:
    host_flag = "--localhost" if mode == "simulator" else "--lan"
    return ["npx", "--no-install", "expo", "start", host_flag, "--port", cfg["QA_METRO_PORT"]]


def _serves_port(entry: dict | None, port: str) -> bool:
    match = PORT_ARG.search((entry or {}).get("command", ""))
    return bool(match) and match.group(1) == port


def ensure_api(cfg: dict[str, str], state: dict, mode: str, started: list[str]) -> None:
    host = api_host(mode)
    entry = state.get("api")
    status_, detail = check_proc(entry)
    if status_ == "running" and entry.get("host") == host and _serves_port(entry, cfg["QA_API_PORT"]):
        return
    if status_ == "running":
        stop_proc(entry, "api")
    elif status_ == "foreign":
        say(f"recorded API is gone ({detail}); that process is left untouched")
    pick_port(cfg, "QA_API_PORT")
    entry = start_detached("api", api_command(cfg, host), API_DIR, api_env(cfg))
    entry["host"] = host
    state["api"] = entry
    save_state(state)
    started.append("api")  # before waiting, so a failed start is cleaned up
    wait_http(
        f"http://{host}:{cfg['QA_API_PORT']}/health",
        lambda c, b: c == 200 and '"db":"ok"' in b.replace(" ", ""),
        60,
        "API",
        pid=entry["pid"],
    )
    record_identity(entry)
    save_state(state)
    say(f"API up at http://{host}:{cfg['QA_API_PORT']} (pid {entry['pid']})")


def metro_env(cfg: dict[str, str], mode: str) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith("EXPO_PUBLIC_")}
    env.update(
        {
            "EXPO_PUBLIC_API_URL": mobile_api_url(cfg, mode),
            "APP_ENV": "local",
            "CI": "1",  # non-interactive Metro (no TTY when detached)
            "EXPO_OFFLINE": "1",  # no Expo account / network calls
            "EXPO_NO_TELEMETRY": "1",
        }
    )
    return env


def ensure_metro(cfg: dict[str, str], state: dict, mode: str, started: list[str]) -> None:
    entry = state.get("metro")
    status_, detail = check_proc(entry)
    if status_ == "running" and entry.get("mode") == mode and _serves_port(entry, cfg["QA_METRO_PORT"]):
        return
    if status_ == "running":
        stop_proc(entry, "metro")
    elif status_ == "foreign":
        say(f"recorded Metro is gone ({detail}); that process is left untouched")
    pick_port(cfg, "QA_METRO_PORT")
    entry = start_detached("metro", metro_command(cfg, mode), MOBILE_DIR, metro_env(cfg, mode))
    entry["mode"] = mode
    state["metro"] = entry
    save_state(state)
    started.append("metro")
    wait_http(
        f"http://127.0.0.1:{cfg['QA_METRO_PORT']}/status",
        lambda c, b: "packager-status:running" in b,
        180,
        "Metro",
        pid=entry["pid"],
    )
    record_identity(entry)
    save_state(state)
    say(f"Metro up on port {cfg['QA_METRO_PORT']} (pid {entry['pid']})")


def runtime_url(cfg: dict[str, str], mode: str) -> str:
    host = "127.0.0.1" if mode == "simulator" else (lan_ip() or "127.0.0.1")
    return f"exp://{host}:{cfg['QA_METRO_PORT']}"


def served_api_url(cfg: dict[str, str]) -> str | None:
    """apiUrl from the manifest Metro serves to Expo Go (what the app will use)."""
    code, body = http_get(
        f"http://127.0.0.1:{cfg['QA_METRO_PORT']}/",
        headers={"expo-platform": "ios", "accept": "application/expo+json,application/json"},
        timeout=60,
    )
    if code != 200:
        return None
    try:
        manifest = json.loads(body)
    except json.JSONDecodeError:
        return None
    extra = (manifest.get("extra") or {}).get("expoClient", {}).get("extra") or manifest.get("extra") or {}
    return extra.get("apiUrl")


def seed(cfg: dict[str, str], mode: str) -> None:
    env = api_env(cfg)
    env["QA_API_URL"] = f"http://{api_host(mode)}:{cfg['QA_API_PORT']}"
    env["QA_DIR"] = str(QA)
    say("seeding demo fixtures (idempotent; a first run waits out the real register/login rate limits)")
    r = subprocess.run(["uv", "run", "--frozen", "python", str(ROOT / "scripts/qa/seed_qa.py")], cwd=API_DIR, env=env)
    if r.returncode != 0:
        fail("seeding failed (see output above)")


def authenticated_read(cfg: dict[str, str], mode: str) -> tuple[bool, str]:
    tokens_path = QA / "tokens.json"
    if not tokens_path.exists():
        return False, "no cached QA token (run qa:seed)"
    token = json.loads(tokens_path.read_text()).get("alice", {}).get("token")
    base = f"http://{api_host(mode)}:{cfg['QA_API_PORT']}"
    code, body = http_get(f"{base}/auth/me", {"Authorization": f"Bearer {token}"})
    if code != 200:
        return False, f"/auth/me → {code}"
    as_of = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    code, body = http_get(
        f"{base}/events?mine=true&segment=past&as_of={as_of}&limit=1", {"Authorization": f"Bearer {token}"}
    )
    if code != 200:
        return False, f"/events → {code}"
    return True, f"QA Alice signed in; {json.loads(body)['total']} past sessions in her My Plans"


def fixture_counts(cfg: dict[str, str]) -> dict[str, object]:
    sql = (
        "select (select count(*) from users where email like 'qa.%@example.com'),"
        " (select count(*) from events where title like 'QA %'),"
        " (select count(*) from bookings b join users u on u.id=b.proposer_id where u.email like 'qa.%@example.com'),"
        " (select count(*) from events where title like 'QA history run%'),"
        " (select version_num from alembic_version)"
    )
    psql = ["exec", "-T", "postgres", "psql", "-U", "sportsgang_qa", "-d", DB_NAME, "-tA", "-c", sql]
    r = compose(cfg, *psql, capture=True, check=False)
    parts = r.stdout.strip().split("|")
    if len(parts) != 5:
        return {}
    return {
        "qa_users": int(parts[0]),
        "qa_sessions": int(parts[1]),
        "qa_bookings": int(parts[2]),
        "qa_history_sessions": int(parts[3]),
        "migration": parts[4],
    }


def open_simulators(cfg: dict[str, str]) -> list[str]:
    r = subprocess.run(["xcrun", "simctl", "list", "devices", "booted", "-j"], capture_output=True, text=True)
    if r.returncode != 0:
        return []
    opened = []
    for devices in json.loads(r.stdout).get("devices", {}).values():
        for d in devices:
            if d.get("state") == "Booted" and "iPhone" in d.get("name", ""):
                # Expo Go keeps the previous JS bundle when it is already open,
                # so quit it first; sign-in survives (it is stored on device).
                subprocess.run(["xcrun", "simctl", "terminate", d["udid"], "host.exp.Exponent"], capture_output=True)
                subprocess.run(
                    ["xcrun", "simctl", "openurl", d["udid"], runtime_url(cfg, "simulator")], capture_output=True
                )
                opened.append(f"{d['name']} ({d['udid']})")
    return opened


def print_qr(url: str) -> None:
    node = "const q=require('qrcode-terminal');q.generate(process.argv[1],{small:true},s=>console.log(s));"
    subprocess.run(["node", "-e", node, url], cwd=ROOT, check=False)


# ─── commands ───────────────────────────────────────────────────────────────


def _cleanup_failed_start(cfg: dict[str, str], state: dict, started: list[str]) -> None:
    """Undo only what this invocation started; never the volume, never a foreign process."""
    say("startup failed; stopping what this run started: " + (", ".join(started) or "nothing"))
    problems = []
    for name in ("metro", "api"):
        if name not in started:
            continue
        try:
            _abandon_spawned((state.get(name) or {}).get("pid", -1))
        except Exception as e:  # report and keep cleaning
            problems.append(f"{name}: {e}")
        state.pop(name, None)
    if "containers" in started:
        r = compose(cfg, "stop", capture=True, check=False)
        if r.returncode != 0:
            problems.append(f"containers: docker compose stop failed ({(r.stderr or '').strip()[-200:]})")
    save_state(state)
    if problems:
        print("[qa] cleanup incomplete: " + " | ".join(problems), file=sys.stderr, flush=True)


def cmd_up(args) -> None:
    cfg = ensure_config()
    with project_lock(cfg):
        claim(cfg)
        _up(cfg, args)


def _up(cfg: dict[str, str], args) -> None:
    state = load_state()
    adopt_legacy(state)
    mode = args.mode or state.get("mode") or "simulator"
    started: list[str] = []
    try:
        if ensure_containers(cfg):
            started.append("containers")
        migrate(cfg)
        ensure_api(cfg, state, mode, started)
        state["mode"] = mode
        save_state(state)
        if not args.no_seed:
            seed(cfg, mode)
        ensure_metro(cfg, state, mode, started)
    except BaseException:
        _cleanup_failed_start(cfg, state, started)
        raise
    state.update(
        {
            "mode": mode,
            "project": cfg["QA_PROJECT"],
            "source_sha": source_sha(),
            "worktree": str(ROOT),
            "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    )
    save_state(state)
    if not status(cfg, state):
        fail("environment is not ready (see status above)")
    if mode == "simulator" and not args.no_open:
        opened = open_simulators(cfg)
        say("opened in: " + (", ".join(opened) if opened else "no booted iPhone simulator found"))
    if mode == "device":
        say(f"On the iPhone (same Wi-Fi), scan this QR or open in Expo Go: {runtime_url(cfg, 'device')}")
        print_qr(runtime_url(cfg, "device"))


def _source_line(name: str, entry: dict, state: dict) -> str:
    """Recorded start SHA vs. what the running process can actually be serving."""
    started_from = entry.get("source_sha") or state.get("source_sha") or ""
    if not started_from:
        return f"{name}: start source not recorded"
    note = " (worktree had uncommitted changes then)" if entry.get("source_dirty") else ""
    # Neither process reloads: uvicorn runs without --reload, and Metro runs
    # with CI=1, which disables its file watcher.
    paths = ("apps/mobile", "packages") if name == "metro" else ("apps/api",)
    head = source_sha()
    changed = started_from != head and git("diff", "--quiet", started_from, head, "--", *paths).returncode != 0
    where = ", ".join(paths)
    if changed:
        return f"{name}: started from {started_from[:12]}{note}; {where} changed since — run qa:restart"
    if dirty(paths):
        return (
            f"{name}: started from {started_from[:12]} at {entry.get('started_at')}; {where} has uncommitted changes"
            " — run qa:restart if they are newer"
        )
    return f"{name}: started from {started_from[:12]}{note}; {where} unchanged since, so it serves that code"


def status(cfg: dict[str, str], state: dict) -> bool:
    mode = state.get("mode", "simulator")
    owner_state, owner_detail = ownership(cfg)
    checks: list[tuple[str, bool, str]] = [("ownership", owner_state in ("owned", "adoptable"), owner_detail)]
    checks.append(("containers", containers_running(cfg), f"{cfg['QA_PROJECT']} postgres + redis"))
    api_entry = state.get("api") or {}
    api_state, api_detail = check_proc(api_entry)
    api_ok = api_state in ("running", "legacy")
    host = api_entry.get("host", "127.0.0.1")
    code = http_get(f"http://{host}:{cfg['QA_API_PORT']}/health")[0] if api_ok else 0
    checks.append(
        ("api", api_ok and code == 200, f"{api_state}: {api_detail}; http://{host}:{cfg['QA_API_PORT']} health={code}")
    )
    if api_ok:
        good, detail = authenticated_read(cfg, mode)
        checks.append(("auth read", good, detail))
    metro_entry = state.get("metro") or {}
    metro_state, metro_detail = check_proc(metro_entry)
    metro_ok = metro_state in ("running", "legacy")
    checks.append(("metro", metro_ok, f"{metro_state}: {metro_detail}; port {cfg['QA_METRO_PORT']} ({mode} mode)"))
    if metro_ok:
        served = served_api_url(cfg)
        expected = mobile_api_url(cfg, mode)
        checks.append(("app API URL", served == expected, f"served {served} (expected {expected})"))
    counts = fixture_counts(cfg) if checks[1][1] else {}
    say(f"worktree {ROOT}")
    say(f"HEAD {source_sha()[:12]}{' + uncommitted changes' if dirty() else ''}")
    for name, entry, ok in (("api", api_entry, api_ok), ("metro", metro_entry, metro_ok)):
        if ok:
            say(_source_line(name, entry, state))
    for name, ok, detail in checks:
        print(f"   {'OK ' if ok else 'BAD'} {name:12} {detail}")
    if counts:
        print(f"   fixtures     {counts}")
    print(f"   app URL      {runtime_url(cfg, mode)}")
    print(f"   credentials  {QA / 'credentials.json'}")
    print(f"   manifest     {QA / 'manifest.json'}")
    print(f"   logs         {LOGS}")
    return all(ok for _, ok, _ in checks)


def cmd_status(args) -> None:
    cfg = ensure_config()
    state = load_state()
    ok = status(cfg, state)
    if args.qr:
        print_qr(runtime_url(cfg, state.get("mode", "simulator")))
    if not ok:
        sys.exit(1)


def cmd_seed(args) -> None:
    cfg = ensure_config()
    with project_lock(cfg):
        claim(cfg)
        state = load_state()
        if check_proc(state.get("api"))[0] not in ("running", "legacy"):
            fail("API is not running; use `npm run qa:up`")
        seed(cfg, state.get("mode", "simulator"))


def cmd_open(args) -> None:
    cfg = ensure_config()
    opened = open_simulators(cfg)
    say("opened in: " + (", ".join(opened) if opened else "no booted iPhone simulator found"))


def cmd_down(args) -> None:
    cfg = ensure_config()
    with project_lock(cfg):
        claim(cfg)
        state = load_state()
        adopt_legacy(state)
        refuse_foreign(state, ("metro", "api"))
        stop_proc(state.get("metro"), "metro")
        stop_proc(state.get("api"), "api")
        if containers_running(cfg):
            compose(cfg, "stop")
            say(f"containers stopped; demo data kept in volume {volume_name(cfg)}")
        state.pop("api", None)
        state.pop("metro", None)
        save_state(state)


def cmd_stop_api(args) -> None:
    """Stop only the QA API so the app can be tested against an unreachable server."""
    cfg = ensure_config()
    with project_lock(cfg):
        claim(cfg)
        state = load_state()
        adopt_legacy(state)
        refuse_foreign(state, ("api",))
        stop_proc(state.get("api"), "api")
        state.pop("api", None)
        save_state(state)
    say("API stopped; Metro, containers and data untouched. Bring it back with: npm run qa:up -- --no-open --no-seed")


def cmd_restart(args) -> None:
    """Restart the API and Metro (e.g. after pulling new code); data is untouched."""
    cfg = ensure_config()
    with project_lock(cfg):
        claim(cfg)
        state = load_state()
        adopt_legacy(state)
        refuse_foreign(state, ("metro", "api"))
        stop_proc(state.get("metro"), "metro")
        stop_proc(state.get("api"), "api")
        _up(cfg, argparse.Namespace(mode=args.mode or state.get("mode"), no_open=args.no_open, no_seed=True))


def cmd_reset(args) -> None:
    if not args.yes:
        fail("reset drops and recreates ONLY the sportsgang_qa database; re-run with `-- --yes`")
    cfg = ensure_config()
    with project_lock(cfg):
        claim(cfg)
        state = load_state()
        adopt_legacy(state)
        if not containers_running(cfg):
            fail("QA containers are not running; use `npm run qa:up` first")
        refuse_foreign(state, ("api",))
        say(f"resetting the {DB_NAME} database (project {cfg['QA_PROJECT']} only)")
        stop_proc(state.get("api"), "api")
        terminate = f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{DB_NAME}' AND pid<>pg_backend_pid()"
        for sql in (terminate, f"DROP DATABASE IF EXISTS {DB_NAME}", f"CREATE DATABASE {DB_NAME} OWNER sportsgang_qa"):
            compose(cfg, "exec", "-T", "postgres", "psql", "-U", "sportsgang_qa", "-d", "postgres", "-c", sql, capture=True)
        for name in ("manifest.json", "tokens.json"):
            (QA / name).unlink(missing_ok=True)
        compose(cfg, "exec", "-T", "redis", "redis-cli", "FLUSHDB", capture=True)
        _up(cfg, argparse.Namespace(mode=state.get("mode"), no_open=True, no_seed=False))


def main() -> None:
    parser = argparse.ArgumentParser(prog="qa", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    up = sub.add_parser("up", help="start (or recover) the QA stack, seed, and open the app")
    up.add_argument("--mode", choices=["simulator", "device"], help="default: last mode, else simulator")
    up.add_argument("--no-open", action="store_true", help="do not open the app in booted simulators")
    up.add_argument("--no-seed", action="store_true", help="skip the idempotent seed step")
    up.set_defaults(func=cmd_up)
    st = sub.add_parser("status", help="show ownership, health, running source, app API URL and fixture counts")
    st.add_argument("--qr", action="store_true", help="also print a QR code for the Expo Go URL")
    st.set_defaults(func=cmd_status)
    sub.add_parser("seed", help="create any missing demo fixtures").set_defaults(func=cmd_seed)
    sub.add_parser("open", help="open the app in booted iPhone simulators").set_defaults(func=cmd_open)
    sub.add_parser("down", help="stop API, Metro and containers; keep demo data").set_defaults(func=cmd_down)
    sub.add_parser("stop-api", help="stop only the API (offline/retry testing)").set_defaults(func=cmd_stop_api)
    rt = sub.add_parser("restart", help="restart API and Metro on the current code; keep data")
    rt.add_argument("--mode", choices=["simulator", "device"])
    rt.add_argument("--no-open", action="store_true")
    rt.set_defaults(func=cmd_restart)
    rs = sub.add_parser("reset", help="drop + recreate the QA database only, then reseed")
    rs.add_argument("--yes", action="store_true")
    rs.set_defaults(func=cmd_reset)
    args = parser.parse_args()
    QA.mkdir(exist_ok=True)
    args.func(args)


if __name__ == "__main__":
    main()
