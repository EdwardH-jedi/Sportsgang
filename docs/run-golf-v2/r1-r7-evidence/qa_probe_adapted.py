# Adapted from docs/run-golf-v2/independent-evidence/qa_probe.py (reviewer probe, unchanged there):
# the same sacrificial child and forged record, run against the repaired launcher API
# (check_proc / stop_proc). Only that child can be signalled; no .qa state is read.
import contextlib, importlib.util, io, json, subprocess, sys, tempfile
from pathlib import Path

W = Path(__file__).resolve().parents[3]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp()) / "qa-probe-adapted.json"
s = importlib.util.spec_from_file_location("qa", W / "scripts/qa/qa.py"); q = importlib.util.module_from_spec(s); s.loader.exec_module(q)
P = Path(tempfile.mkdtemp())
r = {}
child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)", "--port", "8130"], cwd=P,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
entry = {"pid": child.pid, "cwd": str(W / "apps/api"), "cmd": "uv run uvicorn app.main:app --port 8130", "started_at": "wrong-start-time"}
try:
    import time; time.sleep(0.5)
    r["unrelated_child_cwd"] = str(P)
    r["claimed_cwd"] = entry["cwd"]
    state, detail = q.check_proc(entry)
    r["check_proc"] = state
    r["check_proc_detail"] = detail
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        try:
            q.stop_proc(entry, "sacrificial dummy only")
            r["stop_proc_refused"] = False
        except SystemExit:
            r["stop_proc_refused"] = True
    r["stop_proc_message"] = err.getvalue().strip()
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass
    r["unrelated_child_still_running"] = child.poll() is None
finally:
    if child.poll() is None:
        child.terminate(); child.wait()
r["compose_project_default"] = q.DEFAULT_PROJECT
r["project_is_configurable"] = "QA_PROJECT" in Path(W / "scripts/qa/qa.py").read_text()
OUT.write_text(json.dumps(r, indent=2) + "\n")
print(json.dumps(r, indent=2))
