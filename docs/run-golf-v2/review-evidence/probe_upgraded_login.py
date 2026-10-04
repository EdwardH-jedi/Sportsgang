"""Login and record accessibility after a populated 0015 -> 0016 upgrade."""
import asyncio
import json
import os
from pathlib import Path

from httpx import ASGITransport, AsyncClient
from app.main import app

assert os.environ['POSTGRES_URL'].endswith('/codex_review_upgrade2')
OUT = Path(__file__).resolve().parent
fixture = json.loads((OUT/'legacy-journeys.json').read_text())

async def main():
    result = {}
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as c:
            login = await c.post('/auth/login', json={
                'email': fixture['accounts']['Alice']['email'], 'password':'codex-review-local-123'})
            assert login.status_code == 200, login.text
            h = {'Authorization':'Bearer '+login.json()['access_token']}
            async def get(path):
                r = await c.get(path,headers=h)
                assert r.status_code == 200,(path,r.status_code,r.text)
                return r.json()
            me = await get('/auth/me')
            assert me['id'] == fixture['accounts']['Alice']['id']
            matches = await get('/matches')
            assert fixture['legacy_graph']['match'] in [m['id'] for m in matches['items']]
            messages = await get('/matches/'+fixture['legacy_graph']['match']+'/messages')
            assert fixture['legacy_graph']['message'] in [m['id'] for m in messages['items']]
            booking = await get('/bookings/'+fixture['legacy_graph']['booking'])
            assert booking['status'] == 'confirmed'
            event = await get('/events/'+fixture['event'])
            assert event['participant_count'] == 2
            profiles = await get('/users/me/sport-profiles')
            assert {p['sport'] for p in profiles} == {'gym','tennis','running','golf'}
            assert all(p['preferences_version'] is None for p in profiles)
            feed = await get('/discovery?sport=running')
            assert feed['viewer_setup_required'] is True
            run = next(p for p in profiles if p['sport']=='running')
            body = {'sport':'running','level':'intermediate','preferences_version':2,
                    'run_pace_mode':'match_pace','run_pace_min_sec_per_km':330,
                    'run_pace_max_sec_per_km':390}
            saved = await c.post('/users/me/sport-profiles',headers=h,json=body)
            assert saved.status_code == 201,saved.text
            assert saved.json()['id'] == run['id']
            old = await c.post('/users/me/sport-profiles',headers=h,json={'sport':'running','level':'intermediate'})
            assert old.status_code == 201,old.text
            assert old.json()['run_pace_min_sec_per_km'] == 330
            assert old.json()['preferences_version'] == 2
            result = {'status':'PASS','legacy_login_same_user':True,'match_message_booking_event_accessible':True,
                      'gym_tennis_preserved':True,'unconfigured_not_assumed_compatible':True,
                      'v2_upgrade_same_profile_id':True,'old_client_omission_preserves_v2':True}
    (OUT/'upgraded-login-results.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))

asyncio.run(main())
