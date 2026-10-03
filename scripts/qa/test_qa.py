"""Ownership tests for scripts/qa/qa.py (review R2).

    python3 -m unittest scripts/qa/test_qa.py -v                    # identity + ownership
    QA_TEST_DOCKER=1 python3 -m unittest scripts/qa/test_qa.py -v   # + disposable Compose lifecycle

Only sacrificial processes and disposable resources are used: every test
runs the real launcher code against a temporary worktree with its own
SPORTSGANG_QA_HOME, a `qa-test-<random>` Compose project and its own ports.
The shared `sportsgang-qa` project, its volume and its processes are never
read, signalled or changed.
"""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import io
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DOCKER = os.environ.get("QA_TEST_DOCKER") == "1"

SLEEPER = "import time; time.sleep(600)"
# Leader with a child in its own process group (like uv → python, npm → node).
PARENT = (
    "import subprocess, sys, time; subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(600)']); "
    "time.sleep(600)"
)
STUBBORN = "import signal, time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(600)"

# Stand-ins for uvicorn and Metro: answer the launcher's readiness checks.
FAKE_SERVICE = """
import http.server, json, os, sys
kind = sys.argv[1]
port = int(sys.argv[sys.argv.index("--port") + 1])
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if kind == "api" and self.path == "/health":
            body = json.dumps({"status": "ok", "checks": {"db": "ok", "redis": "ok"}})
        elif kind == "metro" and self.path == "/status":
            body = "packager-status:running"
        elif kind == "metro" and self.path == "/":
            body = json.dumps({"extra": {"expoClient": {"extra": {"apiUrl": os.environ["EXPO_PUBLIC_API_URL"]}}}})
        else:
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.end_headers(); self.wfile.write(body.encode())
    def log_message(self, *a):
        pass
http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
"""


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


class LauncherCase(unittest.TestCase):
    """A temporary worktree with the real launcher and compose file."""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="qa-test-")).resolve()
        os.environ["SPORTSGANG_QA_HOME"] = str(self.tmp / "owners")
        self.procs: list[subprocess.Popen] = []
        self.projects: list[tuple] = []
        self.root = self.make_worktree("wt-a")
        self.qa = self.load(self.root)

    def tearDown(self) -> None:
        for proc in self.procs:
            if proc.poll() is None:
                with contextlib.suppress(ProcessLookupError, PermissionError):
                    os.killpg(proc.pid, signal.SIGKILL) if os.getpgid(proc.pid) == proc.pid else proc.kill()
                with contextlib.suppress(Exception):
                    proc.wait(5)
        for qa, cfg in self.projects:
            for entry in qa.load_state().values():
                if isinstance(entry, dict) and qa.check_proc(entry)[0] == "running":
                    os.killpg(entry["pgid"], signal.SIGKILL)
            qa.compose(cfg, "down", "-v", "--remove-orphans", capture=True, check=False)
        os.environ.pop("SPORTSGANG_QA_HOME", None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def make_worktree(self, name: str) -> Path:
        root = self.tmp / name
        for sub in ("scripts/qa", "apps/api", "apps/mobile", ".qa"):
            (root / sub).mkdir(parents=True)
        shutil.copy(HERE / "qa.py", root / "scripts/qa/qa.py")
        shutil.copy(HERE / "compose.qa.yml", root / "scripts/qa/compose.qa.yml")
        return root

    def load(self, root: Path):
        spec = importlib.util.spec_from_file_location(f"qa_{secrets.token_hex(4)}", root / "scripts/qa/qa.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.configure(root)
        return module

    def config(self, qa, project: str | None = None) -> dict:
        cfg = qa.ensure_config()
        cfg["QA_PROJECT"] = project or f"qa-test-{secrets.token_hex(4)}"
        for key in ("QA_API_PORT", "QA_METRO_PORT", "QA_PG_PORT", "QA_REDIS_PORT"):
            cfg[key] = str(free_port())
        qa.write_env(cfg)
        cfg = qa.ensure_config()
        assert cfg["QA_PROJECT"].startswith("qa-test-"), "tests only ever use disposable projects"
        return cfg

    def spawn(self, code: str, *args: str, cwd: Path | None = None, own_group: bool = True) -> subprocess.Popen:
        proc = subprocess.Popen(
            [sys.executable, "-c", code, *args],
            cwd=cwd or self.tmp,
            start_new_session=own_group,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.procs.append(proc)
        # Reap at once (as launchd does for the real detached services), so an
        # exited leader is not a zombie that keeps its group alive.
        threading.Thread(target=proc.wait, daemon=True).start()
        deadline = time.time() + 5
        while self.qa.proc_identity(proc.pid) is None and time.time() < deadline:
            time.sleep(0.05)
        time.sleep(0.2)
        return proc

    def entry_for(self, proc: subprocess.Popen) -> dict:
        actual = self.qa.proc_identity(proc.pid)
        return {"pid": proc.pid, **actual, "started_at": datetime.now(timezone.utc).isoformat()}

    def refused(self, fn, *args) -> str:
        err = io.StringIO()
        with contextlib.redirect_stderr(err), self.assertRaises(SystemExit):
            fn(*args)
        return err.getvalue()

    def no_docker(self, qa, containers: list | None = None, volume: bool = False) -> None:
        qa.project_containers = lambda cfg: containers or []
        qa.volume_exists = lambda cfg: volume
        qa.containers_running = lambda cfg: False


class ProcessIdentityTests(LauncherCase):
    def test_verified_group_is_stopped_with_its_children(self) -> None:
        leader = self.spawn(PARENT, "--port", "8130", cwd=self.root / "apps/api")
        time.sleep(0.5)
        entry = self.entry_for(leader)
        self.assertEqual(self.qa.check_proc(entry)[0], "running")
        self.qa.stop_proc(entry, "api")
        self.assertFalse(self.qa._group_alive(leader.pid), "the child in the group must be gone too")

    def test_reused_pid_with_another_start_time_is_never_signalled(self) -> None:
        old = self.spawn(SLEEPER, "--port", "8130", cwd=self.root / "apps/api")
        recorded = self.entry_for(old)
        os.killpg(old.pid, signal.SIGKILL)
        time.sleep(1.1)  # a later start second
        new = self.spawn(SLEEPER, "--port", "8130", cwd=self.root / "apps/api")
        forged = {**self.entry_for(new), "lstart": recorded["lstart"]}  # same pid, earlier process
        state, detail = self.qa.check_proc(forged)
        self.assertEqual(state, "foreign")
        self.assertIn("lstart", detail)
        self.refused(self.qa.stop_proc, forged, "api")
        self.assertTrue(alive(new.pid))

    def test_wrong_cwd_is_refused(self) -> None:
        proc = self.spawn(SLEEPER, "--port", "8130", cwd=self.tmp)
        forged = {**self.entry_for(proc), "cwd": str(self.root / "apps/api")}
        self.assertEqual(self.qa.check_proc(forged)[0], "foreign")
        self.refused(self.qa.stop_proc, forged, "api")
        self.assertTrue(alive(proc.pid))

    def test_port_marker_and_prefix_collisions_are_refused(self) -> None:
        # The old check (`--port 8130` anywhere in argv) accepted both of these.
        same_marker = self.spawn(SLEEPER, "--port", "8130", cwd=self.tmp)
        prefix = self.spawn(SLEEPER, "--port", "81300", cwd=self.tmp)
        api_cmd = "uv run --frozen uvicorn app.main:app --host 127.0.0.1 --port 8130"
        for proc in (same_marker, prefix):
            self.assertIn("--port 8130", self.qa.proc_identity(proc.pid)["command"])
            forged = {**self.entry_for(proc), "command": api_cmd, "cwd": str(self.root / "apps/api")}
            self.assertEqual(self.qa.check_proc(forged)[0], "foreign")
            self.refused(self.qa.stop_proc, forged, "api")
            self.assertTrue(alive(proc.pid))
        self.assertFalse(self.qa._serves_port({"command": "x --port 81300"}, "8130"))
        self.assertTrue(self.qa._serves_port({"command": "x --port 8130"}, "8130"))

    def test_process_outside_its_own_group_is_refused(self) -> None:
        proc = self.spawn(SLEEPER, "--port", "8130", own_group=False)
        actual = self.qa.proc_identity(proc.pid)
        self.assertNotEqual(actual["pgid"], proc.pid)
        forged = {"pid": proc.pid, **actual}  # every observed fact, but not a group leader
        self.assertEqual(self.qa.check_proc(forged)[0], "foreign")
        self.refused(self.qa.stop_proc, forged, "api")
        self.assertTrue(alive(proc.pid))

    def test_group_that_ignores_sigterm_is_killed_only_after_verification(self) -> None:
        proc = self.spawn(STUBBORN, cwd=self.root / "apps/api")
        self.qa.stop_proc(self.entry_for(proc), "api")
        self.assertFalse(alive(proc.pid))

    def test_legacy_record_is_adopted_only_when_every_fact_matches(self) -> None:
        proc = self.spawn(SLEEPER, "--port", "8130", cwd=self.root / "apps/api")
        actual = self.qa.proc_identity(proc.pid)
        started = datetime.fromtimestamp(time.mktime(time.strptime(actual["lstart"], "%a %b %d %H:%M:%S %Y")))
        legacy = {
            "pid": proc.pid,
            "cmd": actual["command"],
            "cwd": str(self.root / "apps/api"),
            "started_at": started.astimezone(timezone.utc).isoformat(timespec="seconds"),
        }
        self.assertEqual(self.qa.check_proc(dict(legacy))[0], "legacy")
        state = {"api": dict(legacy)}
        self.qa.adopt_legacy(state)
        self.assertEqual(state["api"]["lstart"], actual["lstart"])
        self.assertEqual(self.qa.check_proc(state["api"])[0], "running")

        stale = {**legacy, "started_at": (started - timedelta(hours=1)).astimezone(timezone.utc).isoformat()}
        self.assertEqual(self.qa.check_proc(stale)[0], "foreign")
        self.assertEqual(self.qa.check_proc({**legacy, "cwd": str(self.tmp)})[0], "foreign")
        self.assertTrue(alive(proc.pid))


class OwnershipTests(LauncherCase):
    def test_second_worktree_cannot_claim_or_control_the_project(self) -> None:
        cfg_a = self.config(self.qa)
        self.no_docker(self.qa)
        self.qa.claim(cfg_a)
        record = self.qa.read_owner(cfg_a)
        self.assertEqual(record["worktree"], str(self.root))

        qa_b = self.load(self.make_worktree("wt-b"))
        cfg_b = self.config(qa_b, project=cfg_a["QA_PROJECT"])
        self.no_docker(qa_b)
        self.assertIn("is owned by", self.refused(qa_b.claim, cfg_b))
        for command in (qa_b.cmd_down, qa_b.cmd_stop_api, qa_b.cmd_seed):
            self.refused(command, None)
        self.assertEqual(self.qa.read_owner(cfg_a), record)

    def test_regenerated_config_is_refused(self) -> None:
        cfg = self.config(self.qa)
        self.no_docker(self.qa)
        self.qa.claim(cfg)
        cfg["QA_PG_PASSWORD"] = secrets.token_hex(16)
        self.qa.write_env(cfg)
        self.assertIn("is not the config that claimed", self.refused(self.qa.claim, self.qa.ensure_config()))

    def test_unrecorded_containers_are_adopted_only_with_this_config(self) -> None:
        cfg = self.config(self.qa)
        compose_file = str(self.qa.COMPOSE_FILE)
        mine = [
            {"id": "c1", "service": "postgres", "config_files": compose_file, "pg_password": cfg["QA_PG_PASSWORD"]},
            {"id": "c2", "service": "redis", "config_files": compose_file, "pg_password": None},
        ]
        other_password = [{**mine[0], "pg_password": "someone-else"}, mine[1]]
        other_file = [{**mine[0], "config_files": "/elsewhere/scripts/qa/compose.qa.yml"}, mine[1]]
        for containers in (other_password, other_file):
            self.no_docker(self.qa, containers=containers)
            self.assertEqual(self.qa.ownership(cfg)[0], "conflict")
            self.refused(self.qa.claim, cfg)
            self.assertIsNone(self.qa.read_owner(cfg))
        self.no_docker(self.qa, containers=mine)
        self.assertEqual(self.qa.ownership(cfg)[0], "adoptable")
        self.qa.claim(cfg)
        self.assertEqual(self.qa.read_owner(cfg)["how"], "adopted")

    def test_volume_without_owner_or_containers_is_refused(self) -> None:
        cfg = self.config(self.qa)
        self.no_docker(self.qa, volume=True)
        self.assertIn("cannot be proven", self.refused(self.qa.claim, cfg))

    def test_concurrent_command_on_the_same_project_is_refused(self) -> None:
        cfg = self.config(self.qa)
        with self.qa.project_lock(cfg):
            self.assertIn("another qa command", self.refused(lambda: self.qa.project_lock(cfg).__enter__()))

    def test_down_with_a_foreign_record_stops_nothing(self) -> None:
        cfg = self.config(self.qa)
        self.no_docker(self.qa)
        self.qa.claim(cfg)
        bystander = self.spawn(SLEEPER, "--port", cfg["QA_API_PORT"], cwd=self.tmp)
        mine = self.spawn(SLEEPER, cwd=self.root / "apps/mobile")
        state = {"api": {**self.entry_for(bystander), "cwd": str(self.root / "apps/api")}, "metro": self.entry_for(mine)}
        self.qa.save_state(state)
        self.assertIn("nothing was stopped", self.refused(self.qa.cmd_down, None))
        self.assertTrue(alive(bystander.pid))
        self.assertTrue(alive(mine.pid), "the verified process must not be stopped either")
        self.assertEqual(self.qa.load_state(), state)


@unittest.skipUnless(DOCKER, "set QA_TEST_DOCKER=1 to run disposable Compose lifecycle tests")
class ComposeLifecycleTests(LauncherCase):
    def setUp(self) -> None:
        super().setUp()
        self.service = self.tmp / "fake_service.py"
        self.service.write_text(FAKE_SERVICE)

    def stack(self, qa, project: str | None = None) -> dict:
        cfg = self.config(qa, project)
        self.projects.append((qa, cfg))
        # The interpreter as the OS reports it (a framework Python re-execs
        # itself), so a stand-in's command line stays what it was launched as.
        py, svc = qa.proc_identity(os.getpid())["command"].split()[0], str(self.service)
        qa.api_command = lambda c, host: [py, svc, "api", "--host", host, "--port", c["QA_API_PORT"]]
        qa.metro_command = lambda c, mode: [py, svc, "metro", "--localhost", "--port", c["QA_METRO_PORT"]]
        qa.migrate = lambda c: None
        qa.seed = lambda c, mode: None
        qa.authenticated_read = lambda c, mode: (True, "test stand-in")
        return cfg

    def up(self, qa) -> None:
        qa.cmd_up(argparse.Namespace(mode="simulator", no_open=True, no_seed=True))

    def psql(self, qa, cfg, sql: str) -> subprocess.CompletedProcess:
        args = ["exec", "-T", "postgres", "psql", "-U", "sportsgang_qa", "-d", qa.DB_NAME, "-tAc", sql]
        return qa.compose(cfg, *args, capture=True, check=False)

    def test_up_restart_down_reset_on_a_disposable_project(self) -> None:
        cfg = self.stack(self.qa)
        self.up(self.qa)
        self.assertEqual(self.qa.read_owner(cfg)["how"], "created")
        first = self.qa.load_state()
        self.assertEqual(self.qa.check_proc(first["api"])[0], "running")
        self.assertEqual(self.qa.check_proc(first["metro"])[0], "running")
        self.psql(self.qa, cfg, "CREATE TABLE marker (v text); INSERT INTO marker VALUES ('kept')")

        self.qa.cmd_restart(argparse.Namespace(mode=None, no_open=True))
        second = self.qa.load_state()
        self.assertNotEqual(first["api"]["pid"], second["api"]["pid"])
        self.assertFalse(alive(first["api"]["pid"]))
        self.assertEqual(self.psql(self.qa, cfg, "SELECT v FROM marker").stdout.strip(), "kept")

        self.qa.cmd_down(None)
        self.assertFalse(alive(second["api"]["pid"]) or alive(second["metro"]["pid"]))
        self.assertFalse(self.qa.containers_running(cfg))
        self.assertTrue(self.qa.volume_exists(cfg), "down keeps the volume")

        self.up(self.qa)
        self.assertEqual(self.psql(self.qa, cfg, "SELECT v FROM marker").stdout.strip(), "kept")
        self.qa.cmd_reset(argparse.Namespace(yes=True))
        self.assertIn("does not exist", self.psql(self.qa, cfg, "SELECT v FROM marker").stderr)
        self.assertTrue(self.qa.volume_exists(cfg))
        self.qa.cmd_down(None)

    def test_conflicting_instance_cannot_control_a_running_stack(self) -> None:
        cfg_a = self.stack(self.qa)
        self.up(self.qa)
        api_a = self.qa.load_state()["api"]

        qa_b = self.load(self.make_worktree("wt-b"))
        cfg_b = self.stack(qa_b, project=cfg_a["QA_PROJECT"])
        for command in (lambda: self.up(qa_b), lambda: qa_b.cmd_down(None)):
            self.assertIn("refusing", self.refused(command))
        self.assertTrue(self.qa.containers_running(cfg_a))
        self.assertEqual(self.qa.check_proc(api_a)[0], "running")

        # The same worktree with its own project is an isolated instance.
        cfg_b["QA_PROJECT"] = f"qa-test-{secrets.token_hex(4)}"
        qa_b.write_env(cfg_b)
        cfg_b = qa_b.ensure_config()
        self.projects.append((qa_b, cfg_b))
        self.up(qa_b)
        self.assertTrue(qa_b.containers_running(cfg_b))
        qa_b.cmd_down(None)
        self.assertTrue(self.qa.containers_running(cfg_a), "the other instance is untouched")
        self.assertEqual(self.qa.check_proc(api_a)[0], "running")
        self.qa.cmd_down(None)

    def test_existing_unrecorded_stack_is_adopted_by_its_own_config_only(self) -> None:
        cfg = self.stack(self.qa)
        self.qa.compose(cfg, "up", "-d", "--wait")  # e.g. started by the previous launcher
        qa_b = self.load(self.make_worktree("wt-b"))
        cfg_b = self.config(qa_b, project=cfg["QA_PROJECT"])
        self.assertEqual(qa_b.ownership(cfg_b)[0], "conflict")
        self.assertEqual(self.qa.ownership(cfg)[0], "adoptable")
        self.up(self.qa)
        self.assertEqual(self.qa.read_owner(cfg)["how"], "adopted")
        self.qa.cmd_down(None)

    def test_previous_launcher_stack_is_adopted_without_a_restart(self) -> None:
        cfg = self.stack(self.qa)
        self.qa.compose(cfg, "up", "-d", "--wait")
        containers = {c["id"] for c in self.qa.project_containers(cfg)}
        # Processes and .qa/state.json exactly as the previous launcher left them.
        env = {**os.environ, "EXPO_PUBLIC_API_URL": f"http://127.0.0.1:{cfg['QA_API_PORT']}"}
        legacy: dict = {"mode": "simulator", "worktree": str(self.root)}
        for name, cmd, cwd in (
            ("api", self.qa.api_command(cfg, "127.0.0.1"), self.qa.API_DIR),
            ("metro", self.qa.metro_command(cfg, "simulator"), self.qa.MOBILE_DIR),
        ):
            proc = subprocess.Popen(cmd, cwd=cwd, env=env, start_new_session=True, stdout=subprocess.DEVNULL)
            self.procs.append(proc)
            threading.Thread(target=proc.wait, daemon=True).start()
            started = datetime.now(timezone.utc).isoformat(timespec="seconds")
            legacy[name] = {"pid": proc.pid, "cmd": " ".join(cmd), "cwd": str(cwd), "started_at": started}
        legacy["api"]["host"] = "127.0.0.1"
        legacy["metro"]["mode"] = "simulator"
        self.qa.save_state(legacy)
        self.qa.wait_http(f"http://127.0.0.1:{cfg['QA_API_PORT']}/health", lambda c, b: c == 200, 10, "api")
        self.qa.wait_http(f"http://127.0.0.1:{cfg['QA_METRO_PORT']}/status", lambda c, b: c == 200, 10, "metro")

        self.up(self.qa)
        state = self.qa.load_state()
        self.assertEqual(self.qa.read_owner(cfg)["how"], "adopted")
        self.assertEqual({c["id"] for c in self.qa.project_containers(cfg)}, containers, "containers not recreated")
        for name in ("api", "metro"):
            self.assertEqual(state[name]["pid"], legacy[name]["pid"], f"{name} must not be restarted")
            self.assertEqual(self.qa.check_proc(state[name])[0], "running")
        self.qa.cmd_down(None)
        self.assertFalse(alive(legacy["api"]["pid"]) or alive(legacy["metro"]["pid"]))

    def test_failed_startup_stops_only_what_it_started(self) -> None:
        cfg = self.stack(self.qa)
        bystander = self.spawn(SLEEPER, "--port", cfg["QA_API_PORT"], cwd=self.tmp)
        self.qa.api_command = lambda c, host: [sys.executable, "-c", "raise SystemExit(3)", "--port", c["QA_API_PORT"]]
        self.assertIn("exited during startup", self.refused(lambda: self.up(self.qa)))
        self.assertFalse(self.qa.containers_running(cfg))
        self.assertTrue(self.qa.volume_exists(cfg))
        self.assertNotIn("api", self.qa.load_state())
        self.assertTrue(alive(bystander.pid))

    def test_occupied_port_moves_and_the_listener_survives(self) -> None:
        cfg = self.stack(self.qa)
        port = int(cfg["QA_API_PORT"])
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", port))
            listener.listen()
            self.up(self.qa)
            self.assertNotEqual(int(self.qa.ensure_config()["QA_API_PORT"]), port)
            self.qa.cmd_down(None)
            self.assertEqual(listener.getsockname()[1], port)

    def test_cleanup_failure_is_reported_and_not_escalated(self) -> None:
        cfg = self.stack(self.qa)
        self.qa.api_command = lambda c, host: [sys.executable, "-c", "raise SystemExit(3)", "--port", c["QA_API_PORT"]]
        real = self.qa.compose

        def compose(c, *args, **kw):
            if args and args[0] == "stop":
                return subprocess.CompletedProcess(args, 1, "", "simulated stop failure")
            return real(c, *args, **kw)

        self.qa.compose = compose
        out = self.refused(lambda: self.up(self.qa))
        self.qa.compose = real
        self.assertIn("cleanup incomplete", out)
        self.assertIn("simulated stop failure", out)
        self.assertTrue(self.qa.containers_running(cfg), "a failed stop is reported, not escalated")
        self.assertTrue(self.qa.volume_exists(cfg))


if __name__ == "__main__":
    unittest.main()
