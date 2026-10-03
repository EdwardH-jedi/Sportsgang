"""Use the exact offset-free datetime shape emitted by BookingComposer."""
import asyncio
from datetime import datetime,timedelta,timezone
import json
import os
from pathlib import Path
from httpx import ASGITransport,AsyncClient
from app.main import app
OUT=Path(__file__).resolve().parent

async def main():
    saved=json.loads((OUT/'current-journeys.json').read_text())
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app,raise_app_exceptions=False),base_url='http://test') as c:
            r=await c.post('/auth/login',json={'email':saved['accounts']['Alice']['email'],'password':'codex-review-local-123'})
            assert r.status_code==200,r.text
            h={'Authorization':'Bearer '+r.json()['access_token']}
            future=(datetime.now(timezone.utc)+timedelta(days=2)).replace(hour=9,minute=0,second=0,microsecond=0)
            body={'match_id':saved['legacy_graph']['match'],'sport':'running','starts_at':future.replace(tzinfo=None).isoformat(),'ends_at':(future+timedelta(hours=1)).replace(tzinfo=None).isoformat(),'location':'Codex exact composer payload'}
            naive=await c.post('/bookings',headers=h,json=body)
            body['starts_at']=future.isoformat();body['ends_at']=(future+timedelta(hours=1)).isoformat()
            aware=await c.post('/bookings',headers=h,json=body)
            result={'server_process_TZ':os.environ.get('TZ','host default'),'composer_offset_free_payload_status':naive.status_code,'composer_stored_starts_at':naive.json().get('starts_at'),'aware_payload_status':aware.status_code,'aware_stored_starts_at':aware.json().get('starts_at')}
            tag=os.environ.get('TZ','default').replace('/','-')
            (OUT/f'booking-payload-results-{tag}.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
            assert aware.status_code==201
asyncio.run(main())
