"""Real old-launcher startup followed by repaired adoption, disposable project only."""
import os,pathlib,subprocess,importlib.util,argparse,json,time
root=pathlib.Path(os.environ['REVIEW_ROOT']);boot=pathlib.Path(os.environ['REVIEW_BOOT']);ev=pathlib.Path(os.environ['REVIEW_EVIDENCE'])
os.environ['SPORTSGANG_QA_HOME']=str(boot/'owners')
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
qa=load('repaired',root/'scripts/qa/qa.py');qa.configure(root);cfg=qa.ensure_config();assert cfg['QA_PROJECT']=='sg-codex-r1r7-real'
qa.cmd_down(None)
owner=qa.owner_path(cfg);assert json.loads(owner.read_text())['worktree']==str(root);owner.unlink()
old=load('legacy',boot/'qa_legacy.py')
for k,v in {'ROOT':root,'QA':root/'.qa','CONFIG':root/'.qa/config.env','STATE':root/'.qa/state.json','LOGS':root/'.qa/logs','API_DIR':root/'apps/api','MOBILE_DIR':root/'apps/mobile'}.items():setattr(old,k,v)
# Only fixture namespace/path adapters; earlier launcher implementation remains exact.
old.COMPOSE=['docker','compose','-p',cfg['QA_PROJECT'],'-f',str(root/'scripts/qa/compose.qa.yml')]
def isolated_run(cmd,cwd=None,env=None,check=True,capture=False):
 r=subprocess.run(cmd,cwd=cwd or root,env=env,text=True,capture_output=capture,stdin=subprocess.DEVNULL)
 if check and r.returncode:raise RuntimeError(f'isolated legacy command failed {r.returncode}')
 return r
old.run=isolated_run
old.ensure_containers(cfg);old.migrate(cfg);state={'mode':'simulator','worktree':str(root)};started=[]
old.ensure_api(cfg,state,'simulator',started);old.ensure_metro(cfg,state,'simulator',started);old.save_state(state)
before={n:{'pid':state[n]['pid'],'identity':qa.proc_identity(state[n]['pid']),'check':qa.check_proc(state[n])} for n in ['api','metro']}
print('LEGACY PROCESS CHECKS',json.dumps(before),flush=True)
try:qa.cmd_up(argparse.Namespace(mode='simulator',no_open=True,no_seed=True))
except SystemExit as e:print('up exit',e.code,'(no seeded auth is expected yet)',flush=True)
after=qa.load_state();result={'before':before,'after':{n:{'pid':after[n]['pid'],'check':qa.check_proc(after[n])} for n in ['api','metro']},'same_pids':all(before[n]['pid']==after[n]['pid'] for n in before),'owner_how':qa.read_owner(cfg)['how']}
(ev/'qa-real-legacy-adoption.json').write_text(json.dumps(result,indent=2));print('REAL LEGACY ADOPTION',result['same_pids'],flush=True)
if not result['same_pids']:
 # The launcher may leave refused originals alive; the fixture owns these exact children.
 for n,item in before.items():
  actual=qa.proc_identity(item['pid'])
  if actual==item['identity']:
   entry={'pid':item['pid'],**actual};qa.stop_proc(entry,'sacrificial legacy '+n)
