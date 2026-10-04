"""Full retained-column hash comparison across populated 0015 -> 0016."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import asyncpg

OUT=Path(__file__).resolve().parent
TARGET=OUT.parents[2]/'.claude/worktrees/run-golf-v2'
URL=os.environ['POSTGRES_URL']
assert '/codex_review_upgrade' in URL
TABLES=['users','user_profiles','sport_profiles','identity_preferences','matches','messages','bookings','events','event_participants']

async def main():
    conn=await asyncpg.connect(URL)
    columns={t:[r['column_name'] for r in await conn.fetch('SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position',t)] for t in TABLES}
    async def snapshot():
        out={}
        for t in TABLES:
            rows=await conn.fetch('SELECT '+','.join('"'+x+'"' for x in columns[t])+' FROM '+t)
            hashes=sorted(hashlib.sha256(json.dumps(dict(r),sort_keys=True,default=str).encode()).hexdigest() for r in rows)
            out[t]={'count':len(rows),'row_hashes':hashes,'columns':columns[t]}
        return out
    before=await snapshot()
    assert (await conn.fetchval('SELECT version_num FROM alembic_version'))=='0015'
    env=dict(os.environ,POSTGRES_URL=URL,PYTHONPATH=str(TARGET/'apps/api'))
    p=subprocess.run([str(TARGET/'apps/api/.venv/bin/alembic'),'upgrade','head'],cwd=TARGET/'apps/api',env=env,stdout=(OUT/'alembic-populated.log').open('w'),stderr=subprocess.STDOUT)
    assert p.returncode==0
    after=await snapshot()
    assert before==after,'retained legacy columns or rows changed'
    assert (await conn.fetchval('SELECT version_num FROM alembic_version'))=='0016'
    assert await conn.fetchval('SELECT count(*) FROM sport_profiles WHERE preferences_version IS NOT NULL')==0
    (OUT/'upgrade-retained-hashes.json').write_text(json.dumps({'before':before,'after':after,'equal':True},indent=2))
    print(json.dumps({'status':'PASS','migration_exit_code':p.returncode,'all_retained_columns_identical':True,'counts':{t:d['count'] for t,d in after.items()}},indent=2))
    await conn.close()

asyncio.run(main())
