"""Q08: a real pre-repair launcher starts API/Metro; the repaired launcher adopts them under TZ=UTC.

Adapted from the review's probe_qa_real.py: same steps, a dedicated project
name instead of the reviewer's, the pre-repair launcher taken from git
(`git show 60a264c:scripts/qa/qa.py > $MORNING_BOOT/qa_legacy.py`), and a
final `down` so nothing is left running. Run with TZ=UTC on a non-UTC host:

    TZ=UTC MORNING_ROOT=<worktree> MORNING_BOOT=<private dir> MORNING_EVIDENCE=<dir> \
        MORNING_PROJECT=sg-morning-q08-real python3 <this file>

<worktree>/.qa/config.env must already name MORNING_PROJECT and free ports;
the probe refuses anything else (never the human `sportsgang-qa` project).
"""
import argparse, importlib.util, json, os, pathlib, subprocess, time

root = pathlib.Path(os.environ["MORNING_ROOT"]); boot = pathlib.Path(os.environ["MORNING_BOOT"])
ev = pathlib.Path(os.environ["MORNING_EVIDENCE"]); project = os.environ["MORNING_PROJECT"]
assert project != "sportsgang-qa" and project.startswith("sg-morning-"), project
os.environ["SPORTSGANG_QA_HOME"] = str(boot / "owners")


def load(name, path):
    s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m


qa = load("repaired", root / "scripts/qa/qa.py"); qa.configure(root)
assert qa.read_env(root / ".qa/config.env").get("QA_PROJECT") == project, "write .qa/config.env first"
cfg = qa.ensure_config(); assert cfg["QA_PROJECT"] == project

old = load("legacy", boot / "qa_legacy.py")
for k, v in {"ROOT": root, "QA": root / ".qa", "CONFIG": root / ".qa/config.env", "STATE": root / ".qa/state.json", "LOGS": root / ".qa/logs", "API_DIR": root / "apps/api", "MOBILE_DIR": root / "apps/mobile"}.items():
    setattr(old, k, v)
# Only namespace/path adapters; the pre-repair launcher implementation is unchanged.
old.COMPOSE = ["docker", "compose", "-p", project, "-f", str(root / "scripts/qa/compose.qa.yml")]


def isolated_run(cmd, cwd=None, env=None, check=True, capture=False):
    r = subprocess.run(cmd, cwd=cwd or root, env=env, text=True, capture_output=capture, stdin=subprocess.DEVNULL)
    if check and r.returncode:
        raise RuntimeError(f"isolated legacy command failed {r.returncode}: {r.stderr[-500:] if capture else ''}")
    return r


old.run = isolated_run
result = {"process_tz": os.environ.get("TZ"), "system_zone_lstart_example": None}
try:
    old.ensure_containers(cfg); old.migrate(cfg)
    state = {"mode": "simulator", "worktree": str(root)}; started = []
    old.ensure_api(cfg, state, "simulator", started); old.ensure_metro(cfg, state, "simulator", started); old.save_state(state)
    before = {n: {"pid": state[n]["pid"], "started_at": state[n]["started_at"], "identity": qa.proc_identity(state[n]["pid"]),
                  "start_utc": qa.proc_start_utc(state[n]["pid"]), "check": qa.check_proc(state[n])} for n in ["api", "metro"]}
    result["system_zone_lstart_example"] = before["api"]["identity"]["lstart"]
    print("LEGACY PROCESS CHECKS", json.dumps(before), flush=True)
    try:
        qa.cmd_up(argparse.Namespace(mode="simulator", no_open=True, no_seed=True))
    except SystemExit as e:
        print("up exit", e.code, "(no seeded auth is expected)", flush=True)
    after = qa.load_state()
    result.update(before=before, after={n: {"pid": after[n]["pid"], "check": qa.check_proc(after[n])} for n in ["api", "metro"]},
                  same_pids=all(before[n]["pid"] == after[n]["pid"] for n in before), owner_how=qa.read_owner(cfg)["how"])
    print("REAL LEGACY ADOPTION same_pids =", result["same_pids"], flush=True)
finally:
    try:
        qa.cmd_down(None)
    except SystemExit as e:
        print("down exit", e.code, flush=True)
    subprocess.run(["docker", "compose", "-p", project, "-f", str(root / "scripts/qa/compose.qa.yml"), "--env-file", str(root / ".qa/config.env"), "down", "-v", "--remove-orphans"], capture_output=True)
    (ev / "qa-real-legacy-adoption-utc.json").write_text(json.dumps(result, indent=2) + "\n")
