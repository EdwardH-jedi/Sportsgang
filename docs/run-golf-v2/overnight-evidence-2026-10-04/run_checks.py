import os,pathlib,subprocess,json,secrets,time
root=pathlib.Path(os.environ['REVIEW_ROOT']); ev=pathlib.Path(os.environ['REVIEW_EVIDENCE']); boot=pathlib.Path(os.environ['REVIEW_BOOT']); results=[]
env=os.environ.copy(); env.update(APP_ENV='local',SECRET_KEY=secrets.token_urlsafe(48),POSTGRES_URL='postgresql://review:'+secrets.token_hex(24)+'@127.0.0.1:55504/sg_review',REDIS_URL='redis://127.0.0.1:56504/0',EXPO_PUSH_URL='',DB_NAIVE_TIMEZONE='UTC',TZ='UTC',UV_CACHE_DIR=str(boot/'uv-cache'),EXPO_NO_TELEMETRY='1')
private=boot/'env.json'; private.write_text(json.dumps(env)); private.chmod(0o600)
def run(name,args,cwd=root,extra=None):
 t=time.monotonic()
 with (ev/(name+'.log')).open('w') as log:
  p=subprocess.run(args,cwd=cwd,env={**env,**(extra or {})},stdout=log,stderr=subprocess.STDOUT)
 results.append(dict(name=name,command=args,cwd=str(cwd),exit=p.returncode,seconds=round(time.monotonic()-t,2)))
 (ev/'checks.json').write_text(json.dumps(results,indent=2)); print(name,p.returncode,flush=True)
 return p.returncode
pw=env['POSTGRES_URL'].split(':')[2].split('@')[0]
run('pg-start',['docker','run','-d','--name','sg-codex-r1r7-pg','--label','review=sg-r1r7-20261004','-e','POSTGRES_USER=review','-e','POSTGRES_DB=sg_review','-e','POSTGRES_PASSWORD','-p','127.0.0.1:55504:5432','--tmpfs','/var/lib/postgresql/data','postgres:16-alpine'],extra={'POSTGRES_PASSWORD':pw})
run('redis-start',['docker','run','-d','--name','sg-codex-r1r7-redis','--label','review=sg-r1r7-20261004','-p','127.0.0.1:56504:6379','redis:7-alpine'])
for _ in range(60):
 if subprocess.run(['docker','exec','sg-codex-r1r7-pg','pg_isready','-U','review','-d','sg_review'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0: break
 time.sleep(.2)
api=root/'apps/api'
for n,args in [('migration',['uv','run','--frozen','alembic','upgrade','head']),('ruff-check',['uv','run','--frozen','ruff','check','.']),('ruff-format',['uv','run','--frozen','ruff','format','--check','.']),('api-tests',['uv','run','--frozen','pytest','-q']),('integration',['uv','run','--frozen','pytest','tests_integration','-q','-rs'])]: run(n,args,api)
run('pg-sydney-default',['docker','exec','sg-codex-r1r7-pg','psql','-U','review','-d','sg_review','-c',"ALTER DATABASE sg_review SET timezone TO 'Australia/Sydney'"])
run('integration-sydney',['uv','run','--frozen','pytest','tests_integration','-q','-rs'],api,{'TZ':'Australia/Sydney'})
for n,args in [('mobile-lint',['npm','run','lint','-w','@protin/mobile']),('mobile-typecheck',['npm','run','typecheck','-w','@protin/mobile']),('shared-typecheck',['npm','run','typecheck','-w','@protin/shared-types']),('mobile-tests',['npm','run','test:ci','-w','@protin/mobile','--','--runInBand','--watchman=false']),('ios-export',['npx','--no-install','expo','export','--platform','ios','--output-dir',str(boot/'ios-export')])]: run(n,args,root/'apps/mobile' if n=='ios-export' else root)
run('qa-launcher',['python3','-m','unittest','scripts/qa/test_qa.py','-v'],extra={'QA_TEST_DOCKER':'1'})
