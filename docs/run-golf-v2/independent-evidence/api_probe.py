import asyncio, json, os, secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from app.main import app
from app.db.session import engine

assert '@127.0.0.1:55453/review_' in os.environ['POSTGRES_URL']
P=Path(os.environ.get('REVIEW_EVIDENCE_DIR', Path(__file__).parent))

async def main():
    result={}
    async with app.router.lifespan_context(app):
      async with AsyncClient(transport=ASGITransport(app=app,raise_app_exceptions=False),base_url='http://test') as c:
        async def account(i, profile=True):
          async with AsyncClient(transport=ASGITransport(app=app,client=(f'10.53.0.{i}',10000+i)),base_url='http://test') as reg:
            r=await reg.post('/auth/register',json={'email':f'review-{uuid4().hex}@example.com','password':secrets.token_hex(16)})
          assert r.status_code==201, r.status_code
          h={'Authorization':'Bearer '+r.json()['access_token']}
          uid=(await c.get('/auth/me',headers=h)).json()['id']
          if profile:
            assert (await c.put('/users/me/profile',headers=h,json={'display_name':'Same Name','birth_year':1990,'suburb':'Newtown'})).status_code==200
            assert (await c.post('/users/me/sport-profiles',headers=h,json={'sport':'running','level':'beginner','preferences_version':2,'run_pace_mode':'social','preferred_times':['morning']})).status_code==201
          return h,uid
        a,b,other,unnamed=[await account(i, i!=4) for i in range(1,5)]
        for x,y in ((a,b),(b,a)):
          r=await c.post('/discovery/actions',headers=x[0],json={'target_user_id':y[1],'sport':'running','action':'like'})
          assert r.status_code==200, r.text
        mid=r.json()['match_id']; result['match_created']=bool(mid)
        assert (await c.post(f'/matches/{mid}/messages',headers=b[0],json={'body':'Before the block'})).status_code==201
        result['block_status']=(await c.post(f'/blocks/{b[1]}',headers=a[0])).status_code
        for label,x in [('blocker',a),('blocked',b)]:
          sent=await c.post(f'/matches/{mid}/messages',headers=x[0],json={'body':'After the block'})
          result[label+'_post_messages']=sent.status_code
          result[label+'_get_messages']=(await c.get(f'/matches/{mid}/messages',headers=x[0])).status_code
          matches=await c.get('/matches',headers=x[0])
          result[label+'_match_visible']=mid in [m['id'] for m in matches.json()['items']]
        at=datetime.now(timezone.utc)+timedelta(days=4)
        booking=await c.post('/bookings',headers=b[0],json={'match_id':mid,'sport':'running','starts_at':at.isoformat(),'ends_at':(at+timedelta(hours=1)).isoformat()})
        result['blocked_can_propose_booking']=booking.status_code
        assert (await c.post(f'/blocks/{other[1]}',headers=a[0])).status_code==201
        assert (await c.post(f'/blocks/{unnamed[1]}',headers=a[0])).status_code==201
        for label,x,y in [('blocker',a,other),('blocked',other,a)]:
          feed=await c.get('/discovery?sport=running',headers=x[0])
          result[label+'_discovery_excludes_other']=y[1] not in [u['user_id'] for u in feed.json()['items']]
        blocks=(await c.get('/blocks',headers=a[0])).json()
        result['block_list_names']=[i['blocked_display_name'] for i in blocks['items']]
        result['block_list_ids_distinct']=len({i['blocked_id'] for i in blocks['items']})==3
        result['block_list_exposed_fields']=sorted(blocks['items'][0])
        result['blocked_users_own_list_total']=(await c.get('/blocks',headers=b[0])).json()['total']
        assert (await c.delete(f'/blocks/{other[1]}',headers=a[0])).status_code==204
        remaining=(await c.get('/blocks',headers=a[0])).json()['items']
        result['duplicate_name_unblock_correct_row']={i['blocked_id'] for i in remaining}=={b[1],unnamed[1]}
        result['report_status']=(await c.post('/reports',headers=a[0],json={'target_type':'user','reported_user_id':b[1],'reason':'harassment'})).status_code
        result['delete_disposable_status']=(await c.delete('/auth/me',headers=unnamed[0])).status_code
        result['deleted_token_status']=(await c.get('/auth/me',headers=unnamed[0])).status_code
        # Inspect actual migrated types/defaults and ORM->HTTP serialization.
        async with engine.begin() as conn:
          result['db_timezone']=(await conn.execute(text('SHOW TimeZone'))).scalar()
          cols=(await conn.execute(text("SELECT table_name,column_name,data_type,column_default FROM information_schema.columns WHERE (table_name,column_name) IN (('messages','created_at'),('bookings','created_at'),('bookings','updated_at'),('blocks','created_at'),('reports','created_at'),('notification_events','created_at'),('push_tokens','created_at'),('calendar_booking_syncs','created_at'),('google_calendar_tokens','connected_at'),('event_participants','joined_at')) ORDER BY table_name,column_name"))).mappings().all()
          result['timestamp_schema']=[dict(r) for r in cols]
          await conn.execute(text("UPDATE messages SET created_at='2026-10-02 15:30:00' WHERE match_id=:m"),{'m':mid})
          # now() is the same transaction instant, cast into each session's zone.
          zonevals={}
          for zone in ('UTC','Australia/Sydney'):
            await conn.execute(text(f"SET LOCAL TIME ZONE '{zone}'"))
            row=(await conn.execute(text('SELECT now() AS instant, now()::timestamp AS naive'))).mappings().one()
            zonevals[zone]={k:v.isoformat() for k,v in row.items()}
          result['session_timezone_default_cast']=zonevals
        msg=(await c.get(f'/matches/{mid}/messages',headers=a[0])).json()['items'][0]
        result['http_created_at']=msg['created_at']
        result['http_booking_created_at']=booking.json().get('created_at')
    (P/'api-probe.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

asyncio.run(main())
