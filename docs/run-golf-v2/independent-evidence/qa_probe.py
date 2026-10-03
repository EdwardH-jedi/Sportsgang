import importlib.util, json, subprocess, sys, tempfile, os
from pathlib import Path
W=Path('/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2-home-test')
P=Path(__file__).parent
s=importlib.util.spec_from_file_location('qa',W/'scripts/qa/qa.py');q=importlib.util.module_from_spec(s);s.loader.exec_module(q)
r={}
# Only the sacrificial child below may be stopped. No state from .qa is used.
child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(300)','--port','8130'],cwd=P,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
entry={'pid':child.pid,'cwd':str(W/'apps/api'),'cmd':'uv run uvicorn app.main:app --port 8130','started_at':'wrong-start-time'}
try:
 r['unrelated_child_cwd']=str(P)
 r['claimed_cwd']=entry['cwd']
 r['unrelated_child_accepted_as_owned']=q.proc_alive(entry,q.api_marker({'QA_API_PORT':'8130'}))
 q.stop_proc(entry,'--port 8130','sacrificial dummy only')
 try:child.wait(timeout=2)
 except subprocess.TimeoutExpired:pass
 r['stop_proc_terminated_unrelated_child']=child.poll() is not None
finally:
 if child.poll() is None:child.terminate();child.wait()
r['compose_project']=q.COMPOSE[3]
r['root_bound_to_script_path']=str(q.ROOT)
r['shared_worktree_namespace']=q.COMPOSE[3]=='sportsgang-qa'
r['live_lifecycle']='NOT_RUN: production launcher namespace is hardcoded; no live QA stop/reset was exercised'
(P/'qa-probe.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r,indent=2))
