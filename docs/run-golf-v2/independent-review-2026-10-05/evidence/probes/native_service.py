import pathlib,os,json,subprocess,sys,socket,asyncio
REPO=pathlib.Path(__file__).resolve().parents[5];E=REPO/'docs/run-golf-v2/independent-review-2026-10-05/evidence';(E/'native').mkdir(exist_ok=True)
env=os.environ.copy();env.update(json.loads(pathlib.Path('/private/tmp/sg_review_env_20261005.json').read_text()));env['POSTGRES_URL']=env['POSTGRES_URL'].rsplit('/',1)[0]+'/sg_review_native';env['REDIS_URL']='redis://127.0.0.1:56781/2';env['PATH']='/opt/homebrew/opt/node@20/bin:'+env['PATH']
if sys.argv[1] in ('setup','fixture'):
 if sys.argv[1]=='setup': subprocess.run(['docker','exec','sg-codex-review-20261005-pg','psql','-U','sgr','-d','postgres','-c','CREATE DATABASE sg_review_native;'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['.venv/bin/alembic','upgrade','head'],cwd=REPO/'apps/api',env=env,check=True,stdout=subprocess.DEVNULL)
 os.environ.update(env);sys.path[:0]=[str(REPO/'apps/api'),str(REPO/'apps/api/tests_integration')]
 from test_contact_authority import _pair
 from app.main import app
 from app.db.session import engine
 from httpx import ASGITransport,AsyncClient
 from sqlalchemy import text
 async def setup():
  async with app.router.lifespan_context(app):
   async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
    a,ai,at,b,bi,bt,mid=await _pair(c,'native-review')
    for headers,name in [(a,'Review Alice'),(b,'Alexandria Long Partner Name For Review Case')]:
     p=await c.put('/users/me/profile',headers=headers,json={'display_name':name,'birth_year':1990,'suburb':'Newtown'});assert p.status_code==200,p.text
    for i in range(6):
     p=await c.post(f'/matches/{mid}/messages',headers=b if i%2 else a,json={'body':f'Review message {i+1}: Saturday morning run at the park. 토요일 아침 달리기.'});assert p.status_code==201,p.text
    async with engine.connect() as conn:
     email=(await conn.execute(text('SELECT email FROM users WHERE id=:id'),{'id':ai})).scalar_one()
    f=pathlib.Path('/private/tmp/sg_review_native_credentials_20261005.json');f.write_text(json.dumps({'email':email,'password':'integration-password-123','match':mid,'alice':ai,'bob':bi,'a_token':at,'b_token':bt}));f.chmod(0o600)
    (E/'native/fixture.json').write_text(json.dumps({'match':mid,'alice':ai,'bob':bi,'partner_name':'Alexandria Long Partner Name For Review Case','database':'sg_review_native','api_port':8181,'metro_port':8281},indent=2)+'\n')
 asyncio.run(setup());print('Native fixtures created; credentials stored privately.')
elif sys.argv[1]=='api':
 os.chdir(REPO/'apps/api')
 os.execvpe(str(REPO/'apps/api/.venv/bin/uvicorn'),['uvicorn','app.main:app','--host','127.0.0.1','--port','8181','--no-access-log','--log-level','warning'],env)
elif sys.argv[1]=='metro':
 env.update({'EXPO_PUBLIC_API_URL':'http://127.0.0.1:8181','CI':'1','EXPO_OFFLINE':'1','EXPO_NO_TELEMETRY':'1'})
 os.chdir(REPO/'apps/mobile');os.execvpe('npx',['npx','--no-install','expo','start','--offline','--port','8281'],env)
