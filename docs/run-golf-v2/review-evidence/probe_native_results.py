"""Read back native-created objects and prepare a new local onboarding account."""
import json
from pathlib import Path
import urllib.error
import urllib.request
from uuid import uuid4

OUT = Path(__file__).resolve().parent
fixture = json.loads((OUT/'current-journeys.json').read_text())
def request(path,body=None,token=None):
    data=json.dumps(body).encode() if body is not None else None
    req=urllib.request.Request('http://127.0.0.1:8023'+path,data=data,
        headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def login(name):
    return request('/auth/login',{'email':fixture['accounts'][name]['email'],
                                  'password':'codex-review-local-123'})['access_token']

token = login('Alice')
run = request('/events/ec89d93e-91ac-4ef7-8500-52e0d77dbe64',token=token)
golf = request('/events/bdf8a097-d1e6-4239-855e-adf7fbeaac6f',token=token)
assert run['run_details']['distance_km'] == 5
assert run['starts_at'] == '2026-10-03T19:30:00Z'
assert golf['participant_count'] == golf['capacity'] == 2
assert golf['status'] == 'full'
assert golf['golf_details']['holes'] == 9
assert golf['golf_details']['estimated_cost_cents'] == 3500
assert golf['starts_at'] == '2026-10-03T21:00:00Z'
try:
    request('/events/'+golf['id']+'/join',{},login('Outsider'))
    raise AssertionError('A full round accepted an additional user')
except urllib.error.HTTPError as err:
    assert err.code == 422
result = {'status':'PASS','native_run':{'id':run['id'],'starts_at':run['starts_at'],'run_details':run['run_details']},
          'native_golf':{'id':golf['id'],'starts_at':golf['starts_at'],'capacity':golf['capacity'],
                         'participant_count':golf['participant_count'],'status':golf['status'],'golf_details':golf['golf_details']},
          'additional_user_join_status':422}
(OUT/'native-session-api-results.json').write_text(json.dumps(result,indent=2))
email='codex-onboarding-'+uuid4().hex[:7]+'@example.com'
fresh=request('/auth/register',{'email':email,'password':'codex-review-local-123'})
me=request('/auth/me',token=fresh['access_token'])
(OUT/'native-onboarding-account.json').write_text(json.dumps({'email':email,'id':me['id']},indent=2))
print(json.dumps({'native_results':'PASS','onboarding_email':email,'id':me['id']}))
