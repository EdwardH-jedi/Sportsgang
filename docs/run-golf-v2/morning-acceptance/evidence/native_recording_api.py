"""Run pinned ASGI source with an in-memory HTTP body recorder, no app edits.
Only booking form time fields and response identity/status are saved; auth
headers, JWTs, credentials and other requests are never recorded.
"""
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path.cwd()))
import uvicorn
from app.main import app

assert ':55752/' in os.environ['POSTGRES_URL']
ev = Path(os.environ['REVIEW_EVIDENCE'])

@app.middleware('http')
async def record_booking(request, call_next):
    payload = None
    if request.method == 'POST' and request.url.path == '/bookings':
        body = await request.json()
        payload = {k:body[k] for k in ('match_id','matchId','sport','starts_at','startsAt','ends_at','endsAt') if k in body}
    response = await call_next(request)
    if payload is not None:
        with (ev / 'native-http-bookings.jsonl').open('a') as f:
            f.write(json.dumps({'payload':payload,'status':response.status_code})+'\n')
    return response

uvicorn.run(app, host='127.0.0.1', port=8152, log_level='warning')
