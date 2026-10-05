import asyncio, os, json
from pathlib import Path
from uuid import UUID
from unittest.mock import patch
import pytest
from httpx import ASGITransport, AsyncClient
from test_contact_restriction import _register, _match
from test_contact_authority import _proposal_with_tokens, _event
from test_notification_ownership import _spawn, _kill, _pair_lock_is_free
from app.main import app
from app.db.session import AsyncSessionLocal, engine
from app.services import chat, notifications
assert ':55781/' in os.environ['POSTGRES_URL']
E=Path(os.environ['REVIEW_EVIDENCE']);E.mkdir(parents=True,exist_ok=True)
@pytest.fixture(autouse=True)
async def setup():
 await engine.dispose(close=False)
 async with app.router.lifespan_context(app):yield
 chat.connections._rooms.clear()

async def test_second_cancellation_cannot_release_authority_before_send_cleanup():
 entered, cleaning, release=asyncio.Event(),asyncio.Event(),asyncio.Event()
 running=0
 class Socket:
  async def send_json(self,data):
   nonlocal running
   running+=1;entered.set()
   try:await asyncio.Event().wait()
   finally:
    cleaning.set();await release.wait();running-=1
  async def close(self,code):pass
 async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
  a,ai,_=await _register(c,'double-cancel-a');b,bi,_=await _register(c,'double-cancel-b')
  mid=await _match(c,a,ai,b,bi);chat.connections._rooms[mid]=[Socket()]
  async with AsyncSessionLocal() as db:
   msg=await chat.send_message(db,UUID(mid),UUID(ai),'cleanup boundary')
   at_release=[];original=db.rollback
   async def rollback():at_release.append(running);await original()
   with patch.object(db,'rollback',rollback):
    job=asyncio.create_task(chat.deliver_message(db,msg))
    try:
     await asyncio.wait_for(entered.wait(),5);job.cancel();await asyncio.wait_for(cleaning.wait(),5)
     job.cancel()
     with pytest.raises(asyncio.CancelledError):await job
     block=await asyncio.wait_for(c.post(f'/blocks/{bi}',headers=a),3)
     (E/'double-cancel.json').write_text(json.dumps({'sends_running_at_authority_release':at_release,'sends_running_when_block_committed':running,'block_status':block.status_code})+'\n')
    finally:
     release.set();await asyncio.sleep(.1)
   assert at_release==[0],f'Authority released with {at_release} unfinished send(s)'

async def test_terminated_owner_before_provider_is_unconfirmed_and_not_retried():
 from test_contact_authority import _Server, _Provider
 async with _Server() as srv:
  _,ai,_,bi,_,bid=await _proposal_with_tokens(srv.client,'crash-claim')
  worker=await _spawn('after-lock',bi,bid)
  event=await _event(bid,'proposal_received')
  assert event.failed_reason==notifications.UNCONFIRMED
  await _kill(worker)
  await _pair_lock_is_free(ai,bi)
  provider=_Provider()
  with patch.object(notifications,'_send_expo_push',provider):
   async with AsyncSessionLocal() as db:await notifications.process_pending_notifications(db)
  event=await _event(bid,'proposal_received')
  (E/'crash-after-claim.json').write_text(json.dumps({'provider_calls_for_event':provider.types_for(bid),'failed_reason':event.failed_reason,'sent_at':str(event.sent_at)})+'\n')
  assert provider.types_for(bid)==[] and event.failed_reason==notifications.UNCONFIRMED and event.sent_at is None
