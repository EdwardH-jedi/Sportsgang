"""Independent HTTP/real-PostgreSQL probes. Only the review DB is accepted."""
import asyncio
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

assert '/codex_review' in os.environ['POSTGRES_URL']
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from app.main import app
from app.db.session import engine

OUT = Path(__file__).resolve().parent
PASSWORD = 'codex-review-local-123'

async def main():
    results = {}
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as c:
            async def call(method,path,h=None,body=None,expected=200):
                r=await c.request(method,path,headers=h,json=body)
                assert r.status_code==expected,(path,r.status_code,r.text)
                return r.json() if r.content else None
            async def account(name):
                email=f'codex-{name}-{uuid4().hex[:7]}@example.com'
                async with AsyncClient(transport=ASGITransport(app=app,client=(f'10.10.{len(results)}.{int(uuid4().hex[:2],16)}',1234)),base_url='http://test') as signup:
                    r=await signup.post('/auth/register',json={'email':email,'password':PASSWORD})
                assert r.status_code==201,r.text
                h={'Authorization':'Bearer '+r.json()['access_token']}
                uid=(await call('GET','/auth/me',h))['id']
                await call('PUT','/users/me/profile',h,{'display_name':f'Codex {name}','birth_year':1990,'suburb':'Newtown'})
                return h,uid,email
            async def sport(h,s,**fields):
                return await call('POST','/users/me/sport-profiles',h,dict(sport=s,level='intermediate',preferred_times=['morning'],**fields),201)
            async def event(h,s,title,days=7,capacity=4):
                body={'title':title,'sport':s,'mode':'casual','starts_at':(datetime.now(timezone.utc)+timedelta(days=days)).isoformat(),'location_text':'Codex review local meeting point','capacity':capacity}
                if sys.argv[1]!='legacy':
                    body.update({'run_details':{'distance_km':5,'pace_mode':'social','group_style':'stay_together','walk_breaks_ok':True}} if s=='running' else {'golf_details':{'holes':9,'tee_time_status':'secured','estimated_cost_cents':3500,'beginners_welcome':True}})
                return await call('POST','/events',h,body,201)
            a,aid,aemail=await account('Alice'); b,bid,bemail=await account('Bob'); outsider,oid,oemail=await account('Outsider')
            results['accounts']={'Alice':{'id':aid,'email':aemail},'Bob':{'id':bid,'email':bemail},'Outsider':{'id':oid,'email':oemail}}
            for h in (a,b):
                await call('PUT','/users/me/identity-preferences',h,{'open_to':['any'],'age_range_min':20,'age_range_max':50,'max_distance_km':15})
                for s in ('gym','tennis','running','golf'):
                    await sport(h,s)
            for h,target in ((a,bid),(b,aid)):
                match=await call('POST','/discovery/actions',h,{'target_user_id':target,'action':'like','sport':'running'})
            mid=match['match_id']; assert mid
            message=await call('POST',f'/matches/{mid}/messages',a,{'body':'Codex independent local journey'},201)
            start=datetime.now(timezone.utc)+timedelta(days=5)
            booking=await call('POST','/bookings',a,{'match_id':mid,'sport':'running','starts_at':start.isoformat(),'ends_at':(start+timedelta(hours=1)).isoformat(),'location':'Centennial Park'},201)
            await call('POST',f"/bookings/{booking['id']}/confirm",b)
            results['legacy_graph']={'match':mid,'message':message['id'],'booking':booking['id']}
            run=await event(a,'running','Codex future run')
            await call('POST',f"/events/{run['id']}/join",b)
            for h in (a,b):
                mine=await call('GET','/events?mine=true&limit=50',h)
                assert run['id'] in [i['id'] for i in mine['items']]
            results['run_join_plans']='PASS'
            if sys.argv[1]!='legacy':
                await call('POST',f"/events/{run['id']}/leave",b)
                try:
                    await call('POST',f"/events/{run['id']}/join",b)
                    results['run_leave_rejoin']='PASS'
                except Exception as err:
                    results['run_leave_rejoin']={'status':'FAIL','error':str(err)}
            await call('GET',f'/matches/{mid}/messages',outsider,expected=403)
            await call('GET',f"/bookings/{booking['id']}",outsider,expected=404)
            await call('POST',f"/events/{run['id']}/cancel",b,expected=403)
            await call('GET',f"/events/{run['id']}/attendance",outsider,expected=404)
            results['outsider_message_booking_host_attendance']='PASS'
            if sys.argv[1]=='legacy':
                results['event']=run['id']
            else:
                round_=await event(b,'golf','Codex future round',capacity=2)
                await call('POST',f"/events/{round_['id']}/join",a)
                await call('POST',f"/events/{round_['id']}/join",outsider,expected=422)
                await call('POST',f"/events/{round_['id']}/join",a,expected=409)
                await call('POST',f"/events/{round_['id']}/leave",a)
                try:
                    await call('POST',f"/events/{round_['id']}/join",a)
                    results['golf_leave_rejoin']='PASS'
                except Exception as err:
                    results['golf_leave_rejoin']={'status':'FAIL','error':str(err)}
                results['golf_full_duplicate_leave']='PASS'
                # Explicit consent counterexample: learner accepted by similar-only mentor.
                await sport(a,'golf',preferences_version=2,golf_handicap_source='estimate',golf_handicap_tenths=300,golf_experience='range',golf_partner_intents=['learn_from_experienced'])
                await sport(outsider,'golf',preferences_version=2,golf_handicap_source='estimate',golf_handicap_tenths=240,golf_experience='regular',golf_partner_intents=['similar_level'],golf_similarity_tolerance_tenths=100)
                feed=await call('GET','/discovery?sport=golf&limit=50',a)
                candidate=next((i for i in feed['items'] if i['user_id']==oid),None)
                results['golf_consent_counterexample']={'expected':'excluded until explicit welcome_beginners or any_level','actual':candidate['compatibility'] if candidate else None,'mentor_id':oid}
                # Host history pushes the future run past the client limit.
                async with engine.begin() as db:
                    for i in range(51):
                        eid=uuid4()
                        await db.execute(text("INSERT INTO events (id,host_user_id,title,sport,mode,starts_at,location_text,capacity,visibility,status,created_at,updated_at) VALUES (:id,:host,:title,'running','casual',:start,'Codex review history',4,'public','completed',now(),now())"),{'id':eid,'host':aid,'title':f'Codex old run {i}','start':datetime.now(timezone.utc)-timedelta(days=100-i)})
                        await db.execute(text("INSERT INTO event_participants (id,event_id,user_id,status,joined_at) VALUES (:id,:event,:user,'joined',now())"),{'id':uuid4(),'event':eid,'user':aid})
                first=await call('GET','/events?mine=true&limit=50',a)
                next_=await call('GET','/events?mine=true&limit=50&offset=50',a)
                results['plans_truncation']={'total':first['total'],'first_page_length':len(first['items']),'future_run_on_first_page':run['id'] in [i['id'] for i in first['items']],'future_run_on_second_page':run['id'] in [i['id'] for i in next_['items']],'event_id':run['id']}
                # Preference old-client write safety plus explicit clear/invalid pace.
                before=await sport(a,'running',preferences_version=2,run_pace_mode='match_pace',run_pace_min_sec_per_km=330,run_pace_max_sec_per_km=390,run_distances_km=[5,10])
                after=await sport(a,'running')
                assert all(before[k]==after[k] for k in ('id','preferences_version','run_pace_mode','run_pace_min_sec_per_km','run_pace_max_sec_per_km','run_distances_km'))
                await call('POST','/users/me/sport-profiles',a,{'sport':'running','level':'intermediate','run_pace_max_sec_per_km':None},422)
                results['old_client_preserves_v2_and_invalid_partial_pace_rejected']='PASS'
                await sport(b,'running',preferences_version=2,run_pace_mode='social')
                await sport(b,'golf',preferences_version=2,golf_handicap_source='none',golf_experience='range',golf_partner_intents=['any_level'])
                results['ui_accounts_password']='local throwaway password is in probe script; tokens are never saved'
                results['ui_run_event']=run['id']; results['ui_golf_event']=round_['id']
    (OUT/f'{sys.argv[1]}-journeys.json').write_text(json.dumps(results,indent=2))
    print(json.dumps(results,indent=2))

asyncio.run(main())
