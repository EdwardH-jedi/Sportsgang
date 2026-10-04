"""C01: what a pinned session would store for two instants an hour apart, and what the API sends back.

Read-only. For the configured DB_NAIVE_TIMEZONE (run once per zone), PostgreSQL
converts each instant to the wall time `now()` would store in a session pinned
to that zone (`instant AT TIME ZONE zone`); the actual AuditInstant converter
(`app.core.time.utc_instant`) then reads it back. Inputs are the review's:
2026-04-04T15:30Z and 16:30Z, either side of Sydney's 2026-04-05 03:00 → 02:00
fall-back. No row is written; no clock is frozen; production is not touched.

    REVIEW_EVIDENCE=<dir> DB_NAIVE_TIMEZONE=<zone> POSTGRES_URL=<disposable> \
        apps/api/.venv/bin/python <this file>          # run from apps/api
"""
import asyncio, json, os, pathlib, sys
from datetime import datetime

sys.path.insert(0, str(pathlib.Path.cwd()))
from sqlalchemy import text

from app.core.config import get_settings
from app.core.time import utc_instant
from app.db.session import engine


async def main():
    zone = get_settings().db_naive_timezone
    rows = []
    async with engine.connect() as conn:
        session_zone = (await conn.execute(text("SHOW timezone"))).scalar_one()
        for stamp in ["2026-04-04T15:30:00+00:00", "2026-04-04T16:30:00+00:00"]:
            instant = datetime.fromisoformat(stamp)
            stored = (await conn.execute(text("SELECT CAST(:i AS timestamptz) AT TIME ZONE :z"), {"i": instant, "z": zone})).scalar_one()
            sent = utc_instant(stored)
            rows.append(dict(actual_instant=instant.isoformat(), stored_naive=stored.isoformat(), serialized=sent.isoformat(), exact=sent == instant))
    await engine.dispose()
    result = dict(db_naive_timezone=zone, pinned_session_timezone=session_zone, rows=rows,
                  distinct_stored_values=len({r["stored_naive"] for r in rows}),
                  scope="read-only PostgreSQL scalar conversion plus the actual AuditInstant converter; not a live INSERT")
    out = pathlib.Path(os.environ["REVIEW_EVIDENCE"]) / f"r6-overlap-{zone.replace('/', '-')}.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


asyncio.run(main())
