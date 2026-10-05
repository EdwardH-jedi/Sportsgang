import os,sys,pathlib,json,subprocess,time
REPO=pathlib.Path(__file__).resolve().parents[5]
E=REPO/'docs/run-golf-v2/independent-review-2026-10-05/evidence'
env=os.environ.copy();env.update(json.loads(pathlib.Path('/private/tmp/sg_review_env_20261005.json').read_text()));env['PATH']='/opt/homebrew/opt/node@20/bin:'+env['PATH']
mode=sys.argv[1]
if mode in ('utc','sydney'):
 env['POSTGRES_URL']=env['POSTGRES_URL'].rsplit('/',1)[0]+'/sg_review_'+mode
 env['REDIS_URL']='redis://127.0.0.1:56781/'+('0' if mode=='utc' else '1')
 commands=[('migration-'+mode,['.venv/bin/alembic','upgrade','head'],'apps/api'),('integration-'+mode,['.venv/bin/pytest','tests_integration','-q','-rs'],'apps/api')]
elif mode=='api':
 commands=[('api-unit',['.venv/bin/pytest','-q','tests'],'apps/api'),('ruff-check',['.venv/bin/ruff','check','.'],'apps/api'),('ruff-format',['.venv/bin/ruff','format','--check','.'],'apps/api')]
elif mode.startswith('mobile'):
 env['TZ']='UTC' if mode.endswith('utc') else 'Australia/Sydney'
 commands=[(mode,['npm','run','test:ci','-w','@protin/mobile','--','--runInBand','--watchman=false'],'.')]
elif mode=='static':
 commands=[('mobile-lint',['npm','run','lint','-w','@protin/mobile'],'.'),('mobile-typecheck',['npm','run','typecheck','-w','@protin/mobile'],'.'),('web-typecheck',['npm','run','typecheck','-w','@protin/web'],'.'),('web-build',['npm','run','build','-w','@protin/web'],'.'),('web-routes',['npm','run','check:routes','-w','@protin/web'],'.'),('preflight-unit',['python3','-m','unittest','scripts/release/test_preflight.py'],'.'),('preflight',['python3','scripts/release/preflight.py'],'.'),('launcher-unit',['python3','-m','unittest','scripts/qa/test_qa.py'],'.')]
elif mode=='r1':
 env['REVIEW_EVIDENCE']=str(E/'r1')
 commands=[('r1-adapted',['.venv/bin/python','../../docs/run-golf-v2/morning-fixes/evidence/probe_r1_adapted.py'],'apps/api')]
else: raise ValueError(mode)
for name,command,cwd in commands:
 start=time.monotonic()
 with (E/'logs'/f'{name}.log').open('w') as f:
  try:p=subprocess.run(command,cwd=REPO/cwd,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=900);rc=p.returncode
  except subprocess.TimeoutExpired:rc=124
 result={'name':name,'exit':rc,'seconds':round(time.monotonic()-start,2),'command':command,'cwd':cwd}
 (E/'logs'/f'{name}.result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
 if rc: print((E/'logs'/f'{name}.log').read_text()[-2600:],flush=True)
