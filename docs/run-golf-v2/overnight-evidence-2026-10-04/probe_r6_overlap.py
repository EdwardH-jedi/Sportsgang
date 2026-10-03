"""Read-only PG demonstration of information loss with the supported Sydney naive zone."""
import asyncio,json,os,pathlib,sys
from datetime import datetime,timezone
sys.path.insert(0,str(pathlib.Path.cwd()))
from sqlalchemy import text
from app.db.session import engine
from app.core.time import utc_instant
from app.core.config import get_settings
async def main():
 rows=[]
 async with engine.connect() as conn:
  for stamp in ['2026-04-04T15:30:00+00:00','2026-04-04T16:30:00+00:00']:
   value=datetime.fromisoformat(stamp)
   wall=(await conn.execute(text("SELECT CAST(:instant AS timestamptz) AT TIME ZONE 'Australia/Sydney'"),{'instant':value})).scalar_one()
   wire=utc_instant(wall)
   rows.append(dict(actual_instant=value.isoformat(),pg_naive=wall.isoformat(),serialized=wire.isoformat(),exact=wire==value))
 await engine.dispose()
 result=dict(configuration=get_settings().db_naive_timezone,rows=rows,scope='read-only real PG scalar conversion plus actual AuditInstant converter; controlled historical instants, not a clock-frozen live INSERT')
 (pathlib.Path(os.environ['REVIEW_EVIDENCE'])/'r6-overlap.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
asyncio.run(main())
