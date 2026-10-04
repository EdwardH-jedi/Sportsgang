"""Compare the actual native HTTP POST with literal PostgreSQL booking bounds."""
import asyncio
from datetime import datetime
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path.cwd()))
from sqlalchemy import text
from app.db.session import engine

ev=Path(os.environ['REVIEW_EVIDENCE'])
assert ':55752/' in os.environ['POSTGRES_URL']
async def main():
    request=json.loads((ev/'native-http-bookings.jsonl').read_text().splitlines()[-1])
    payload=request['payload']
    start=datetime.fromisoformat(payload['starts_at'].replace('Z','+00:00'))
    end=datetime.fromisoformat(payload['ends_at'].replace('Z','+00:00'))
    sql='SELECT id,status,starts_at,ends_at FROM bookings WHERE match_id=:m AND starts_at=:s AND ends_at=:e ORDER BY created_at DESC'
    async with engine.connect() as c:
        rows=[dict(r) for r in (await c.execute(text(sql), {'m':payload['match_id'],'s':start,'e':end})).mappings()]
    assert request['status']==201 and len(rows)==1, rows
    row=rows[0]
    assert row['starts_at']==start and row['ends_at']==end and row['status']=='proposed'
    receipt=dict(http=request,postgres=row,form_date='2026-10-05',form_start='11:30 AM Sydney',form_end='12:30 PM Sydney',form_pixels='native/fresh-default-form.png',sql=sql,consistent=True)
    (ev/'native-form-http-postgres.json').write_text(json.dumps(receipt,indent=2,default=str)+'\n')
    print(json.dumps(receipt,indent=2,default=str))
    await engine.dispose()
asyncio.run(main())
