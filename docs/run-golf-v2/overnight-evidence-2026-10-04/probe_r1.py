"""Independent real-PostgreSQL acceptance; deterministic barriers, no provider calls."""
import asyncio,json,sys,os,pathlib,copy
from uuid import UUID
from unittest.mock import patch
from sqlalchemy import text
from httpx import AsyncClient,ASGITransport
sys.path.insert(0,str(pathlib.Path.cwd()))
from tests_integration.test_contact_restriction import _register,_match,_proposal,_PairLock,_scalar,_free_port
from app.main import app
from app.db.session import engine,AsyncSessionLocal
from app.services import chat,safety,notifications
from app.models.notification import PushToken
import uvicorn
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed
out=[]
def record(name,expected,actual):
 out.append(dict(case=name,expected=copy.deepcopy(expected),actual=copy.deepcopy(actual),verdict='PASS' if actual==expected else 'FAIL'))
 print(name,out[-1]['verdict'],actual,flush=True)
async def pair(c):
 a,ai,at=await _register(c,'overnight-a');b,bi,bt=await _register(c,'overnight-b');m=await _match(c,a,ai,b,bi);return a,ai,at,b,bi,bt,m
async def matrix(c):
 for direction in [0,1]:
  a,ai,at,b,bi,bt,m=await pair(c)
  await c.post(f'/matches/{m}/messages',headers=a,json={'body':'retained history'})
  booking=await c.post('/bookings',headers=a,json=_proposal(m));bid=booking.json()['id']
  confirmed=await c.post('/bookings',headers=a,json=_proposal(m));cid=confirmed.json()['id'];await c.post(f'/bookings/{cid}/confirm',headers=b,json={})
  cancelled=await c.post('/bookings',headers=a,json=_proposal(m));canid=cancelled.json()['id'];await c.post(f'/bookings/{canid}/confirm',headers=b,json={})
  no_show=await c.post('/bookings',headers=a,json=_proposal(m));nid=no_show.json()['id'];await c.post(f'/bookings/{nid}/confirm',headers=b,json={})
  challenger=await c.post('/challenges',headers=a,json={'opponent_user_id':bi,'sport':'running','area':'Bondi'});hid=challenger.json().get('id')
  blocker,target=(a,bi) if direction==0 else (b,ai)
  record(f'd{direction}:block',201,(await c.post(f'/blocks/{target}',headers=blocker)).status_code)
  for tag,h,other in [('a',a,bi),('b',b,ai)]:
   requests=[('get',f'/matches/{m}/messages',None),('post',f'/matches/{m}/messages',{'body':'refuse'}),('post','/bookings',_proposal(m)),('post','/challenges',{'opponent_user_id':other,'sport':'running','area':'Bondi'})]+[('post','/discovery/actions',{'target_user_id':other,'sport':'golf','action':action}) for action in ['like','pass','save']]
   for method,path,payload in requests:
    r=await getattr(c,method)(path,headers=h,**({'json':payload} if payload is not None else {})); record(f'd{direction}:{tag}:{method}:{path}:{payload.get("action","") if payload else ""}',403,r.status_code)
   r=await c.get('/matches',headers=h);record(f'd{direction}:{tag}:match-total',0,r.json()['total'])
   record(f'd{direction}:{tag}:booking-detail',200,(await c.get(f'/bookings/{bid}',headers=h)).status_code)
   record(f'd{direction}:{tag}:booking-list',200,(await c.get('/bookings',headers=h)).status_code)
   record(f'd{direction}:{tag}:report',201,(await c.post('/reports',headers=h,json={'target_type':'user','reported_user_id':other,'reason':'harassment'})).status_code)
  record(f'd{direction}:confirm',403,(await c.post(f'/bookings/{bid}/confirm',headers=b,json={})).status_code)
  if hid:record(f'd{direction}:challenge-accept',403,(await c.post(f'/challenges/{hid}/accept',headers=b,json={})).status_code)
  else:record(f'd{direction}:challenge-fixture',201,challenger.status_code)
  record(f'd{direction}:decline',200,(await c.post(f'/bookings/{bid}/decline',headers=b,json={})).status_code)
  record(f'd{direction}:complete',200,(await c.post(f'/bookings/{cid}/complete',headers=a,json={})).status_code)
  record(f'd{direction}:cancel-confirmed',200,(await c.post(f'/bookings/{canid}/cancel',headers=b,json={})).status_code)
  record(f'd{direction}:no-show',200,(await c.post(f'/bookings/{nid}/no-show',headers=b,json={})).status_code)
  record(f'd{direction}:retained-message-row',1,await _scalar('SELECT count(*) FROM messages WHERE match_id=:m',m=m))
  record(f'd{direction}:unblock',204,(await c.delete(f'/blocks/{target}',headers=blocker)).status_code)
  r=await c.get(f'/matches/{m}/messages',headers=b);record(f'd{direction}:restored-history',1,r.json()['total'])
 a,ai,at,b,bi,bt,m=await pair(c)
 await c.post(f'/matches/{m}/messages',headers=b,json={'body':'delete fixture history'});await c.post(f'/blocks/{bi}',headers=a)
 record('blocked account deletion',204,(await c.delete('/auth/me',headers=a)).status_code)
 record('deleted token auth',401,(await c.get('/auth/me',headers=a)).status_code)
 record('deletion cascades retained message',0,await _scalar('SELECT count(*) FROM messages WHERE match_id=:m',m=m))
async def admission(c):
 a,ai,at,b,bi,bt,m=await pair(c);reached=asyncio.Event();resume=asyncio.Event();orig=chat.connections.connect
 async def delayed(room,ws):
  if room==m:reached.set();await resume.wait()
  await orig(room,ws)
 port=_free_port();server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=port,lifespan='off',log_level='warning'));serve=asyncio.create_task(server.serve())
 try:
  while not server.started:await asyncio.sleep(.02)
  async def open_socket():return await connect(f'ws://127.0.0.1:{port}/matches/{m}/ws?token={at}')
  with patch.object(chat.connections,'connect',delayed):
   opening=asyncio.create_task(open_socket());await asyncio.wait_for(reached.wait(),5)
   r=await c.post(f'/blocks/{bi}',headers=a);assert r.status_code==201
   resume.set();ws=await asyncio.wait_for(opening,5)
   try:
    await asyncio.wait_for(ws.recv(),.3);actual='unexpected frame'
   except asyncio.TimeoutError:actual='remains connected after block'
   except ConnectionClosed as e:actual=f'closed {e.rcvd.code}'
   record('admission-check -> block -> registration','closed 4003',actual);await ws.close()
 finally:
  server.should_exit=True;await asyncio.wait_for(serve,10)
async def delivery(c):
 a,ai,at,b,bi,bt,m=await pair(c)
 async with AsyncSessionLocal() as db:msg=await chat.send_message(db,UUID(m),UUID(bi),'stored before block')
 admitted=asyncio.Event();register=asyncio.Event();checked=asyncio.Event();broadcast=asyncio.Event()
 original_connect=chat.connections.connect;original_broadcast=chat.connections.broadcast
 async def delayed_connect(room,ws):admitted.set();await register.wait();await original_connect(room,ws)
 async def delayed_broadcast(room,data):checked.set();await broadcast.wait();await original_broadcast(room,data)
 port=_free_port();server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=port,lifespan='off',log_level='warning'));serve=asyncio.create_task(server.serve())
 try:
  while not server.started:await asyncio.sleep(.02)
  async def open_socket():return await connect(f'ws://127.0.0.1:{port}/matches/{m}/ws?token={at}')
  with patch.object(chat.connections,'connect',delayed_connect),patch.object(chat.connections,'broadcast',delayed_broadcast):
   opening=asyncio.create_task(open_socket());await asyncio.wait_for(admitted.wait(),5)
   async with AsyncSessionLocal() as db:
    pushing=asyncio.create_task(chat.deliver_message(db,msg));await asyncio.wait_for(checked.wait(),5)
    assert (await c.post(f'/blocks/{bi}',headers=a)).status_code==201
    register.set();ws=await asyncio.wait_for(opening,5);broadcast.set();await pushing
    try:actual=json.loads(await asyncio.wait_for(ws.recv(),2))['body']
    except ConnectionClosed:actual='no frame'
    except asyncio.TimeoutError:actual='no frame'
    record('live admission + broadcast barriers -> committed block -> wire frame','no frame',actual);await ws.close()
 finally:server.should_exit=True;await asyncio.wait_for(serve,10)
async def queued_push(c):
 a,ai,at,b,bi,bt,m=await pair(c)
 async with AsyncSessionLocal() as db:
  db.add(PushToken(user_id=UUID(bi),token=f'ExponentPushToken[review-{bi}]',platform='ios'));await db.commit()
 r=await c.post('/bookings',headers=a,json=_proposal(m));bid=r.json()['id'];reached=asyncio.Event();resume=asyncio.Event();delivered=[]
 original_token=notifications._get_latest_push_token
 async def delayed_token(db,recipient):
  if str(recipient)==bi:reached.set();await resume.wait()
  return await original_token(db,recipient)
 async def transport(token,title,body,data):
  if data['bookingId']==bid:delivered.append(data['type'])
  return True
 with patch.object(notifications,'_send_expo_push',transport),patch.object(notifications,'_get_latest_push_token',delayed_token):
  async with AsyncSessionLocal() as db:
   job=asyncio.create_task(notifications.process_pending_notifications(db));await asyncio.wait_for(reached.wait(),5)
   await c.post(f'/blocks/{bi}',headers=a);resume.set();await job
 record('proposal-check -> delayed token lookup -> block -> push invocation',[],delivered)
 await c.post(f'/bookings/{bid}/cancel',headers=a,json={});delivered.clear()
 with patch.object(notifications,'_send_expo_push',transport):
  async with AsyncSessionLocal() as db:await notifications.process_pending_notifications(db)
 record('existing commitment cancellation notification',['booking_cancelled'],delivered)
async def fresh_account(c):
 for operation in ['send','like','proposal']:
  a,ai,at,b,bi,bt,m=await pair(c);reached=asyncio.Event();pidbox=[];orig=safety._lock_pair
  async def observed(db,x,y,**kw):
   pidbox.append((await db.execute(text('SELECT pg_backend_pid()'))).scalar_one());reached.set();return await orig(db,x,y,**kw)
  async with _PairLock(ai,bi,'FOR NO KEY UPDATE') as lock:
   await lock.conn.execute(text('UPDATE users SET is_active=false WHERE id=:id'),{'id':ai})
   with patch.object(safety,'_lock_pair',observed):
    path,payload=(f'/matches/{m}/messages',{'body':'inactive after lock'}) if operation=='send' else ('/discovery/actions',{'target_user_id':bi,'sport':'golf','action':'like'}) if operation=='like' else ('/bookings',_proposal(m))
    task=asyncio.create_task(c.post(path,headers=a,json=payload));await asyncio.wait_for(reached.wait(),5)
    for _ in range(100):
     async with engine.connect() as conn:waiting=(await conn.execute(text("SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=:pid"),{'pid':pidbox[0]})).scalar()
     if waiting:break
     await asyncio.sleep(.02)
    assert waiting,'must observe real PostgreSQL lock wait';await lock.tx.commit();r=await asyncio.wait_for(task,8)
    record(f'fresh actor state after pair lock:{operation}',403,r.status_code)
    sql={'send':'SELECT count(*) FROM messages WHERE match_id=:m','like':"SELECT count(*) FROM discovery_actions WHERE actor_id=:m AND sport='golf'",'proposal':'SELECT count(*) FROM bookings WHERE match_id=:m'}[operation]
    record(f'inactive actor prohibited persisted rows:{operation}',0,await _scalar(sql,m=ai if operation=='like' else m))
    record(f'deactivated actor next HTTP auth:{operation}',401,(await c.get('/auth/me',headers=a)).status_code)
async def notification_worker(user_id,booking_id):
 original=notifications._get_latest_push_token
 async def lookup(db,user):
  if str(user)==user_id:
   print('TOKEN_LOOKUP_BARRIER',flush=True);await asyncio.to_thread(sys.stdin.readline)
  return await original(db,user)
 async def transport(token,title,body,data):
  if data['bookingId']==booking_id:print('PROVIDER_INVOCATION '+data['type'],flush=True)
  return True
 with patch.object(notifications,'_get_latest_push_token',lookup),patch.object(notifications,'_send_expo_push',transport):
  async with AsyncSessionLocal() as db:await notifications.process_pending_notifications(db)
 await engine.dispose()
async def cross_process_push(c):
 a,ai,at,b,bi,bt,m=await pair(c)
 async with AsyncSessionLocal() as db:
  db.add(PushToken(user_id=UUID(bi),token=f'ExponentPushToken[worker-{bi}]',platform='ios'));await db.commit()
 bid=(await c.post('/bookings',headers=a,json=_proposal(m))).json()['id']
 process=await asyncio.create_subprocess_exec(sys.executable,__file__,'worker',bi,bid,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
 try:
  line=await asyncio.wait_for(process.stdout.readline(),10);assert line.decode().strip()=='TOKEN_LOOKUP_BARRIER',line
  assert (await c.post(f'/blocks/{bi}',headers=a)).status_code==201
  process.stdin.write(b'resume\n');await process.stdin.drain();stdout,stderr=await asyncio.wait_for(process.communicate(),10)
  assert process.returncode==0,stderr.decode();actual=[l.split(' ',1)[1] for l in stdout.decode().splitlines() if l.startswith('PROVIDER_INVOCATION ')]
  record('separate notification process token lookup -> block -> provider invocation',[],actual)
 finally:
  if process.returncode is None:process.kill();await process.wait()
async def main():
 async with app.router.lifespan_context(app):
  async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
   for name,fn in [('matrix',matrix),('admission',admission),('delivery',delivery),('queued-push',queued_push),('fresh-account',fresh_account),('cross-process-push',cross_process_push)]:
    try:await fn(c)
    except Exception as e:out.append(dict(case=name,verdict='HARNESS_ERROR',error=repr(e)));print(name,repr(e),flush=True)
 path=pathlib.Path(os.environ['REVIEW_EVIDENCE'])/'r1-results.json';path.write_text(json.dumps(out,indent=2))
 print('RESULTS',{v:sum(x['verdict']==v for x in out) for v in ['PASS','FAIL','HARNESS_ERROR']},flush=True)
if len(sys.argv)>1 and sys.argv[1]=='worker':asyncio.run(notification_worker(sys.argv[2],sys.argv[3]))
else:asyncio.run(main())
