"""Exercise real launcher lifecycle in a reviewer-owned Compose project only."""
import importlib.util,json,os,pathlib,subprocess,time
root=pathlib.Path(os.environ['REVIEW_ROOT']);boot=pathlib.Path(os.environ['REVIEW_BOOT']);ev=pathlib.Path(os.environ['REVIEW_EVIDENCE'])
env=os.environ.copy();env['SPORTSGANG_QA_HOME']=str(boot/'owners')
os.environ['SPORTSGANG_QA_HOME']=env['SPORTSGANG_QA_HOME']
spec=importlib.util.spec_from_file_location('qa_lifecycle',root/'scripts/qa/qa.py');qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa);qa.configure(root)
cfg=qa.ensure_config();assert cfg['QA_PROJECT']=='sg-codex-r1r7-real'
results=[]
def check(name,actual,expected):
 results.append({'name':name,'actual':actual,'expected':expected,'status':'PASS' if actual==expected else 'FAIL'})
 print(results[-1],flush=True);(ev/'qa-real-lifecycle.json').write_text(json.dumps(results,indent=2))
def cli(name,args):
 start=time.monotonic()
 with open(ev/(name+'.log'),'w') as log:r=subprocess.run(['python3','scripts/qa/qa.py',*args],cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 check(name+' exit',r.returncode,0);print('seconds',round(time.monotonic()-start,2),flush=True)
 if r.returncode:raise RuntimeError(name+' failed')
def sql(q):return qa.compose(cfg,'exec','-T','postgres','psql','-U','sportsgang_qa','-d',qa.DB_NAME,'-tA','-c',q,capture=True).stdout.strip()
sql('CREATE TABLE codex_review_marker (v integer PRIMARY KEY); INSERT INTO codex_review_marker VALUES (104);')
before=qa.load_state();cli('qa-real-restart',['restart','--no-open']);after=qa.load_state()
check('restart replaces API and Metro PIDs',all(before[n]['pid']!=after[n]['pid'] for n in ['api','metro']),True)
check('restart preserves database marker',sql('SELECT v FROM codex_review_marker'),'104')
check('restart verified children',all(qa.check_proc(after[n])[0]=='running' for n in ['api','metro']),True)
cli('qa-real-down',['down']);check('down removes recorded children',all(n not in qa.load_state() for n in ['api','metro']),True)
check('down stops review containers',qa.containers_running(cfg),False)
cli('qa-real-up-again',['up','--no-open','--no-seed']);check('down/up preserves database marker',sql('SELECT v FROM codex_review_marker'),'104')
cli('qa-real-reset',['reset','--yes']);check('reset removes review database marker',sql("SELECT to_regclass('public.codex_review_marker') IS NULL"),'t')
check('reset reseeds eight accounts',sql('SELECT count(*) FROM users'),'8')
cli('qa-real-final-status',['status'])
cli('qa-real-final-down',['down'])
print('RESULT',sum(x['status']=='PASS' for x in results),'PASS',sum(x['status']=='FAIL' for x in results),'FAIL',flush=True)
