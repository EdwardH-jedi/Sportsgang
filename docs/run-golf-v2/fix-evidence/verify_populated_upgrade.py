"""Populated 0015 -> head upgrade, then the repaired runtime on pre-existing rows.

Run from apps/api against an EMPTY disposable database on the fix-review
stack (compose.yml in this folder):

    POSTGRES_URL=…/fix_legacy uv run python ../../docs/run-golf-v2/fix-evidence/verify_populated_upgrade.py OUT.json

1. `alembic upgrade 0015` (the schema before the run/golf v2 work).
2. Seed legacy rows with SQL: three users with profiles, gym/tennis/running/
   golf sport profiles, identity preferences, a match with a message, three
   bookings (confirmed future, proposed future, completed past) and two
   events (a future one with a joined and a *left* participant, and a
   completed past one).
3. Hash every column of every seeded row, `alembic upgrade head`, re-hash
   the same columns: IDs, foreign keys and values must be unchanged, and the
   new v2 columns must be NULL on legacy rows.
4. Through the real app: legacy login, legacy sport rows readable, the
   legacy *left* participant rejoins (F1 on a pre-existing row: same row id),
   and the legacy bookings/events land in the right My Plans segments (F2).

Records PASS/FAIL per check and exits 1 on any failure. The account
password is random per run and never written out.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

URL = os.environ.get("POSTGRES_URL", "")
if "@127.0.0.1:55453/" not in URL:
    sys.exit("refusing to run: POSTGRES_URL is not the disposable fix-review database (127.0.0.1:55453)")

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402

TABLES = (
    "users",
    "user_profiles",
    "sport_profiles",
    "identity_preferences",
    "matches",
    "messages",
    "bookings",
    "events",
    "event_participants",
)
PASSWORD = secrets.token_hex(12)
NOW = datetime.now(timezone.utc).replace(microsecond=0)


def alembic(target: str) -> str:
    out = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", target], capture_output=True, text=True, check=True
    )
    current = subprocess.run([sys.executable, "-m", "alembic", "current"], capture_output=True, text=True, check=True)
    return (out.stderr + out.stdout).strip().splitlines()[-1] + " | current: " + current.stdout.strip()


async def snapshot(engine, columns: dict[str, list[str]] | None = None):
    hashes: dict[str, str] = {}
    counts: dict[str, int] = {}
    seen_columns: dict[str, list[str]] = {}
    async with engine.connect() as conn:
        for table in TABLES:
            if columns is None:
                cols = [
                    r[0]
                    for r in await conn.execute(
                        text(
                            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' "
                            "AND table_name=:t ORDER BY ordinal_position"
                        ),
                        {"t": table},
                    )
                ]
            else:
                cols = columns[table]
            seen_columns[table] = cols
            rows = (await conn.execute(text(f"SELECT {', '.join(cols)} FROM {table} ORDER BY id"))).all()
            counts[table] = len(rows)
            digest = hashlib.sha256()
            for row in rows:
                digest.update(repr(tuple(row)).encode())
            hashes[table] = digest.hexdigest()
    return seen_columns, counts, hashes


async def seed(engine) -> dict[str, str]:
    ids = {k: str(uuid4()) for k in ("ann", "ben", "cat", "match", "b_conf", "b_prop", "b_done", "e_future", "e_past")}
    pw = hash_password(PASSWORD)
    async with engine.begin() as conn:

        async def run(sql: str, **params) -> None:
            await conn.execute(text(sql), params)

        for name in ("ann", "ben", "cat"):
            await run(
                "INSERT INTO users (id, email, hashed_password) VALUES (:id, :email, :pw)",
                id=ids[name],
                email=f"legacy-{name}-{uuid4().hex[:8]}@example.com",
                pw=pw,
            )
            await run(
                "INSERT INTO user_profiles (id, user_id, display_name, birth_year, suburb) "
                "VALUES (:id, :uid, :name, 1990, 'Newtown')",
                id=str(uuid4()),
                uid=ids[name],
                name=f"Legacy {name.title()}",
            )
        for name in ("ann", "ben"):
            for sport, extra in (
                ("gym", {"gym_name": "City Gym"}),
                ("tennis", {}),
                ("running", {}),
                ("golf", {"golf_club": "Moore Park"}),
            ):
                await run(
                    "INSERT INTO sport_profiles (id, user_id, sport, level, preferred_times, gym_name, golf_club, goals) "
                    "VALUES (:id, :uid, :sport, 'intermediate', '[\"morning\"]', :gym, :club, 'Stay fit')",
                    id=str(uuid4()),
                    uid=ids[name],
                    sport=sport,
                    gym=extra.get("gym_name"),
                    club=extra.get("golf_club"),
                )
            await run("INSERT INTO identity_preferences (id, user_id) VALUES (:id, :uid)", id=str(uuid4()), uid=ids[name])
        await run(
            "INSERT INTO matches (id, user1_id, user2_id, sport) VALUES (:id, :a, :b, 'tennis')",
            id=ids["match"],
            a=ids["ann"],
            b=ids["ben"],
        )
        await run(
            "INSERT INTO messages (id, match_id, sender_id, body) VALUES (:id, :m, :s, 'See you at the courts')",
            id=str(uuid4()),
            m=ids["match"],
            s=ids["ann"],
        )
        for key, days, status in (("b_conf", 4, "confirmed"), ("b_prop", 6, "proposed"), ("b_done", -20, "completed")):
            await run(
                "INSERT INTO bookings (id, match_id, proposer_id, partner_id, sport, starts_at, ends_at, location, status) "
                "VALUES (:id, :m, :p, :q, 'tennis', :s, :e, 'Moore Park courts', :status)",
                id=ids[key],
                m=ids["match"],
                p=ids["ann"],
                q=ids["ben"],
                s=NOW + timedelta(days=days),
                e=NOW + timedelta(days=days, hours=1),
                status=status,
            )
        for key, days, status in (("e_future", 5, "open"), ("e_past", -15, "completed")):
            await run(
                "INSERT INTO events (id, host_user_id, title, sport, starts_at, location_text, capacity, status) "
                "VALUES (:id, :host, 'Legacy hit', 'tennis', :s, 'Moore Park courts', 4, :status)",
                id=ids[key],
                host=ids["ann"],
                s=NOW + timedelta(days=days),
                status=status,
            )
            await run(
                "INSERT INTO event_participants (id, event_id, user_id, status) VALUES (:id, :e, :u, 'joined')",
                id=str(uuid4()),
                e=ids[key],
                u=ids["ann"],
            )
        ids["left_participant"] = str(uuid4())
        await run(
            "INSERT INTO event_participants (id, event_id, user_id, status, joined_at, left_at) "
            "VALUES (:id, :e, :u, 'left', :j, :l)",
            id=ids["left_participant"],
            e=ids["e_future"],
            u=ids["ben"],
            j=NOW - timedelta(days=2),
            l=NOW - timedelta(days=1),
        )
        await run(
            "INSERT INTO event_participants (id, event_id, user_id, status) VALUES (:id, :e, :u, 'joined')",
            id=str(uuid4()),
            e=ids["e_future"],
            u=ids["cat"],
        )
    async with engine.connect() as conn:
        emails = {str(r[0]): r[1] for r in await conn.execute(text("SELECT id, email FROM users"))}
    ids.update({f"{n}_email": emails[ids[n]] for n in ("ann", "ben", "cat")})
    return ids


async def main(out: Path) -> int:
    results: dict[str, object] = {"database": URL.rsplit("/", 1)[-1], "run_at_utc": NOW.isoformat()}
    checks: dict[str, dict] = {}

    def check(name: str, ok: bool, **detail: object) -> None:
        checks[name] = {"status": "PASS" if ok else "FAIL", **detail}

    engine = create_async_engine(get_settings().async_postgres_url)
    try:
        async with engine.connect() as conn:
            tables = (
                await conn.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"))
            ).scalar()
        if tables:
            sys.exit("refusing to run: the target database is not empty")
        results["upgrade_to_0015"] = alembic("0015")
        ids = await seed(engine)
        results["fixture_ids"] = {k: v for k, v in ids.items() if not k.endswith("_email")}
        columns, counts_before, hashes_before = await snapshot(engine)
        results["upgrade_to_head"] = alembic("head")
        _, counts_after, hashes_after = await snapshot(engine, columns)
        check(
            "retained_rows_and_columns_unchanged",
            hashes_before == hashes_after and counts_before == counts_after,
            counts=counts_after,
            changed=[t for t in TABLES if hashes_before[t] != hashes_after[t]],
        )
        async with engine.connect() as conn:
            v2 = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM sport_profiles WHERE preferences_version IS NOT NULL OR "
                        "run_pace_mode IS NOT NULL OR golf_partner_intents IS NOT NULL"
                    )
                )
            ).scalar()
            ev2 = (
                await conn.execute(
                    text("SELECT count(*) FROM events WHERE run_distance_km IS NOT NULL OR golf_holes IS NOT NULL")
                )
            ).scalar()
            joined_type = (
                await conn.execute(
                    text(
                        "SELECT data_type FROM information_schema.columns "
                        "WHERE table_name='event_participants' AND column_name='joined_at'"
                    )
                )
            ).scalar()
        check("v2_columns_null_on_legacy_rows", v2 == 0 and ev2 == 0, sport_profiles_with_v2=v2, events_with_v2=ev2)
        check("joined_at_is_timestamptz", joined_type == "timestamp with time zone", data_type=joined_type)
    finally:
        await engine.dispose()

    from app.main import app  # imported after the migrations ran

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:

            async def login(name: str) -> dict[str, str]:
                r = await c.post("/auth/login", json={"email": ids[f"{name}_email"], "password": PASSWORD})
                assert r.status_code == 200, r.text
                return {"Authorization": f"Bearer {r.json()['access_token']}"}

            ann, ben = await login("ann"), await login("ben")
            check("legacy_login", True)
            profiles = (await c.get("/users/me/sport-profiles", headers=ann)).json()
            by_sport = {p["sport"]: p for p in profiles}
            check(
                "legacy_sport_rows_readable",
                set(by_sport) == {"gym", "tennis", "running", "golf"}
                and by_sport["gym"]["gym_name"] == "City Gym"
                and by_sport["golf"]["golf_club"] == "Moore Park"
                and all(p["preferences_version"] is None for p in profiles),
                sports=sorted(by_sport),
            )
            messages = await c.get(f"/matches/{ids['match']}/messages", headers=ben)
            check("legacy_match_messages_readable", messages.status_code == 200 and len(messages.json()["items"]) == 1)

            rejoin = await c.post(f"/events/{ids['e_future']}/join", headers=ben)
            engine = create_async_engine(get_settings().async_postgres_url)
            try:
                async with engine.connect() as conn:
                    rows = (
                        await conn.execute(
                            text("SELECT id, status, left_at FROM event_participants WHERE event_id=:e AND user_id=:u"),
                            {"e": ids["e_future"], "u": ids["ben"]},
                        )
                    ).all()
            finally:
                await engine.dispose()
            check(
                "legacy_left_participant_rejoins_same_row",
                rejoin.status_code == 200
                and rejoin.json()["participant_count"] == 3
                and [(str(r.id), r.status, r.left_at) for r in rows] == [(ids["left_participant"], "joined", None)],
                http=rejoin.status_code,
                rows=[(str(r.id), r.status) for r in rows],
            )

            as_of = NOW.isoformat().replace("+00:00", "Z")

            async def seg(path: str, headers: dict) -> list[str]:
                r = await c.get(f"{path}&as_of={as_of}", headers=headers)
                assert r.status_code == 200, r.text
                return [i["id"] for i in r.json()["items"]]

            plans = {
                "booking_upcoming": await seg("/bookings?segment=upcoming", ann),
                "booking_pending": await seg("/bookings?segment=pending", ann),
                "booking_past": await seg("/bookings?segment=past", ann),
                "event_upcoming": await seg("/events?mine=true&segment=upcoming", ann),
                "event_past": await seg("/events?mine=true&segment=past", ann),
            }
            check(
                "legacy_rows_in_my_plans_segments",
                plans
                == {
                    "booking_upcoming": [ids["b_conf"]],
                    "booking_pending": [ids["b_prop"]],
                    "booking_past": [ids["b_done"]],
                    "event_upcoming": [ids["e_future"]],
                    "event_past": [ids["e_past"]],
                },
                segments=plans,
            )
            booking = (await c.get(f"/bookings/{ids['b_conf']}", headers=ben)).json()
            check(
                "legacy_booking_sport_and_status_kept",
                booking["sport"] == "tennis" and booking["status"] == "confirmed",
            )

    results["checks"] = checks
    failed = sorted(k for k, v in checks.items() if v["status"] == "FAIL")
    results["summary"] = {"failed": failed, "passed": sorted(k for k in checks if k not in failed)}
    out.write_text(json.dumps(results, indent=2, default=str) + "\n")
    print(json.dumps(results["summary"], indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(Path(sys.argv[1]))))
