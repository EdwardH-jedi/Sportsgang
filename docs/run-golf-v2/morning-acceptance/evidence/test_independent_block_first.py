"""Independent block-first stored-delivery and disconnect checks on real WS/PG."""
import asyncio
import os
from pathlib import Path
import sys
from unittest.mock import patch
from uuid import UUID
sys.path.insert(0,str(Path.cwd()))
sys.path.insert(0,str(Path.cwd()/'tests_integration'))
import pytest
from sqlalchemy import text
from websockets.asyncio.client import connect
from app.main import app
from app.db.session import AsyncSessionLocal,engine
from app.services import chat
from test_contact_authority import _Server,_pair,_registered
from test_contact_restriction import _closed_with

assert ':55752/' in os.environ['POSTGRES_URL']

async def test_real_disconnect_releases_admission_lock_and_block_first_drops_stored_effect():
    await engine.dispose(close=False)
    async with app.router.lifespan_context(app),_Server() as srv:
        a,ai,at,b,bi,bt,m=await _pair(srv.client,'independent-block-first')
        async with AsyncSessionLocal() as db:
            stored=await chat.send_message(db,UUID(m),UUID(bi),'stored effect must be dropped')
        ws=await connect(srv.ws(m,at))
        await _registered(m,1)
        await ws.close()
        await _registered(m,0)
        # A real disconnect cannot leave the admission SHARE lock held.
        blocked=await asyncio.wait_for(srv.client.post(f'/blocks/{bi}',headers=a),1)
        assert blocked.status_code==201
        async with engine.connect() as c:
            assert (await c.execute(text('SELECT count(*) FROM blocks WHERE blocker_id=:a AND blocked_id=:b'),{'a':ai,'b':bi})).scalar_one()==1
        invoked=[]
        async def record(room,data):
            invoked.append(data)
        with patch.object(chat.connections,'broadcast',record):
            async with AsyncSessionLocal() as db:
                assert await chat.deliver_message(db,stored) is False
        assert invoked==[], 'server broadcast invocation, not later client arrival'
        async with connect(srv.ws(m,at)) as refused:
            await _closed_with(refused,4003)
        assert len(chat.connections._rooms.get(m,[]))==0
