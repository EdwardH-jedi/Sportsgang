"""API-level reproduction of review findings F1, F2, F3 and F5 on real PostgreSQL.

Run from apps/api with the disposable fix-review database (compose.yml in
this folder):

    TZ=UTC uv run python ../../docs/run-golf-v2/fix-evidence/probe_findings.py OUT.json
    TZ=Australia/Sydney uv run python ../../docs/run-golf-v2/fix-evidence/probe_findings.py OUT.json

Unlike the historical review probe, every check records PASS/FAIL **and** the
process exits 1 when any check fails, so exit 0 means every check passed.

Credentials: POSTGRES_URL / REDIS_URL / SECRET_KEY come from the environment
and must point at the localhost disposable stack (guarded below). Test-account
passwords are random per run and never written to the output.
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from random import randrange
from uuid import uuid4

if "@127.0.0.1:55453/" not in os.environ.get("POSTGRES_URL", ""):
    sys.exit("refusing to run: POSTGRES_URL is not the disposable fix-review database (127.0.0.1:55453)")

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = os.environ.get("FIX_PROBE_PASSWORD") or secrets.token_hex(12)


async def main(out: Path) -> int:
    results: dict[str, dict] = {
        "_meta": {
            "process_tz": os.environ.get("TZ"),
            "time_tzname": list(time.tzname),
            "run_at_utc": datetime.now(timezone.utc).isoformat(),
        }
    }

    def record(name: str, ok: bool, **detail: object) -> None:
        results[name] = {"status": "PASS" if ok else "FAIL", **detail}

    async with app.router.lifespan_context(app):
        # raise_app_exceptions=False: an unhandled server error is observed as HTTP 500
        # (what a client sees) instead of aborting the probe.
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as c:

            async def call(method: str, path: str, h: dict | None = None, body: object = None):
                r = await c.request(method, path, headers=h, json=body)
                if not r.content:
                    return r.status_code, None
                try:
                    return r.status_code, r.json()
                except ValueError:  # e.g. a plain-text 500 body
                    return r.status_code, {"raw": r.text[:200]}

            async def ok(method: str, path: str, h: dict | None = None, body: object = None, expected: int = 200):
                code, data = await call(method, path, h, body)
                assert code == expected, (method, path, code, data)
                return data

            async def account(name: str) -> tuple[dict, str]:
                peer = (f"10.{randrange(256)}.{randrange(256)}.{randrange(1, 255)}", randrange(1024, 65535))
                async with AsyncClient(transport=ASGITransport(app=app, client=peer), base_url="http://test") as s:
                    r = await s.post(
                        "/auth/register",
                        json={"email": f"fixprobe-{name}-{uuid4().hex[:8]}@example.com", "password": PASSWORD},
                    )
                assert r.status_code == 201, r.text
                h = {"Authorization": "Bearer " + r.json()["access_token"]}
                uid = (await ok("GET", "/auth/me", h))["id"]
                await ok(
                    "PUT",
                    "/users/me/profile",
                    h,
                    {"display_name": f"Probe {name}", "birth_year": 1990, "suburb": "Newtown"},
                )
                await ok(
                    "PUT",
                    "/users/me/identity-preferences",
                    h,
                    {"open_to": ["any"], "age_range_min": 20, "age_range_max": 60, "max_distance_km": 30},
                )
                return h, uid

            async def sport(h: dict, s: str, **fields: object) -> dict:
                body = dict(sport=s, level="intermediate", preferred_times=["morning"], **fields)
                return await ok("POST", "/users/me/sport-profiles", h, body, 201)

            def future(days: int) -> str:
                return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

            async def session(h: dict, s: str, capacity: int) -> dict:
                body = {
                    "title": f"Probe {s}",
                    "sport": s,
                    "mode": "casual",
                    "starts_at": future(7),
                    "location_text": "Probe meeting point",
                    "capacity": capacity,
                }
                if s == "running":
                    body["run_details"] = {"distance_km": 5, "pace_mode": "social", "group_style": "stay_together"}
                else:
                    body["golf_details"] = {"holes": 9, "tee_time_status": "planning", "beginners_welcome": True}
                return await ok("POST", "/events", h, body, 201)

            host, host_id = await account("host")
            guest, guest_id = await account("guest")

            # ── F1: join → leave → rejoin (running and golf) ─────────────────
            for s, cap in (("running", 4), ("golf", 2)):
                ev = await session(host, s, cap)
                eid = ev["id"]
                steps: dict[str, object] = {"event_id": eid}
                code, data = await call("POST", f"/events/{eid}/join", guest)
                steps["join"] = code
                full_after_join = data["status"] if code == 200 else None
                code, data = await call("POST", f"/events/{eid}/leave", guest)
                steps["leave"] = code
                status_after_leave = data["status"] if code == 200 else None
                async with engine.connect() as db:
                    before_ids = [
                        str(r[0])
                        for r in await db.execute(
                            text("SELECT id FROM event_participants WHERE event_id=:e AND user_id=:u"),
                            {"e": eid, "u": guest_id},
                        )
                    ]
                code, data = await call("POST", f"/events/{eid}/join", guest)
                steps["rejoin"] = code
                steps["rejoin_detail"] = data if code != 200 else None
                async with engine.connect() as db:
                    rows = [
                        (str(r[0]), r[1])
                        for r in await db.execute(
                            text("SELECT id, status FROM event_participants WHERE event_id=:e AND user_id=:u"),
                            {"e": eid, "u": guest_id},
                        )
                    ]
                passed = (
                    steps["join"] == 200
                    and steps["leave"] == 200
                    and steps["rejoin"] == 200
                    and [r[0] for r in rows] == before_ids
                    and [r[1] for r in rows] == ["joined"]
                    and (data or {}).get("participant_count") == 2
                    and (s != "golf" or (full_after_join == "full" and status_after_leave == "open"))
                    and (s != "golf" or (data or {}).get("status") == "full")
                )
                record(f"F1_{s}_leave_rejoin", passed, steps=steps, participant_rows=rows)

            # ── F3: learner vs similar-only golfer with a broad tolerance ────
            learner, learner_id = await account("learner")
            mentor, mentor_id = await account("mentor")
            await sport(
                learner,
                "golf",
                preferences_version=2,
                golf_handicap_source="estimate",
                golf_handicap_tenths=300,
                golf_experience="range",
                golf_partner_intents=["learn_from_experienced"],
            )
            await sport(
                mentor,
                "golf",
                preferences_version=2,
                golf_handicap_source="estimate",
                golf_handicap_tenths=240,
                golf_experience="regular",
                golf_partner_intents=["similar_level"],
                golf_similarity_tolerance_tenths=100,
            )
            feed = await ok("GET", "/discovery?sport=golf&limit=50", learner)
            reverse = await ok("GET", "/discovery?sport=golf&limit=50", mentor)
            card = next((i for i in feed["items"] if i["user_id"] == mentor_id), None)
            back = next((i for i in reverse["items"] if i["user_id"] == learner_id), None)
            record(
                "F3_consent_counterexample_excluded",
                card is None and back is None,
                learner_sees_mentor=card["compatibility"] if card else None,
                mentor_sees_learner=back["compatibility"] if back else None,
            )
            # Control: the same mentor explicitly welcoming beginners is eligible.
            await sport(mentor, "golf", golf_partner_intents=["similar_level", "welcome_beginners"])
            feed = await ok("GET", "/discovery?sport=golf&limit=50", learner)
            card = next((i for i in feed["items"] if i["user_id"] == mentor_id), None)
            codes = sorted(r["code"] for r in card["compatibility"]["reasons"]) if card else None
            record(
                "F3_welcome_beginners_control_eligible",
                card is not None and "more_experienced" in (codes or []) and "welcomes_beginners" in (codes or []),
                reason_codes=codes,
            )

            # ── F2: history must not displace future commitments ─────────────
            planner, planner_id = await account("planner")
            partner, partner_id = await account("partner")
            for h in (planner, partner):
                await sport(h, "running")
            await ok(
                "POST",
                "/discovery/actions",
                planner,
                {"target_user_id": partner_id, "action": "like", "sport": "running"},
            )
            like = await ok(
                "POST",
                "/discovery/actions",
                partner,
                {"target_user_id": planner_id, "action": "like", "sport": "running"},
            )
            match_id = like["match_id"]
            future_event = await session(planner, "running", 6)
            start = datetime.now(timezone.utc) + timedelta(days=4)
            confirmed = await ok(
                "POST",
                "/bookings",
                planner,
                {
                    "match_id": match_id,
                    "sport": "running",
                    "starts_at": start.isoformat(),
                    "ends_at": (start + timedelta(hours=1)).isoformat(),
                },
                201,
            )
            await ok("POST", f"/bookings/{confirmed['id']}/confirm", partner)
            start2 = start + timedelta(days=1)
            proposed = await ok(
                "POST",
                "/bookings",
                partner,
                {
                    "match_id": match_id,
                    "sport": "running",
                    "starts_at": start2.isoformat(),
                    "ends_at": (start2 + timedelta(hours=1)).isoformat(),
                },
                201,
            )
            async with engine.begin() as db:
                for i in range(55):
                    eid = uuid4()
                    at = datetime.now(timezone.utc) - timedelta(days=200 - i)
                    await db.execute(
                        text(
                            "INSERT INTO events (id,host_user_id,title,sport,mode,starts_at,location_text,capacity,"
                            "visibility,status,created_at,updated_at) VALUES (:id,:host,:title,'running','casual',:at,"
                            "'Probe history',4,'public','completed',now(),now())"
                        ),
                        {"id": eid, "host": planner_id, "title": f"Old run {i}", "at": at},
                    )
                    await db.execute(
                        text(
                            "INSERT INTO event_participants (id,event_id,user_id,status,joined_at) "
                            "VALUES (:id,:e,:u,'joined',now() at time zone 'utc')"
                        ),
                        {"id": uuid4(), "e": eid, "u": planner_id},
                    )
                    await db.execute(
                        text(
                            "INSERT INTO bookings (id,match_id,proposer_id,partner_id,sport,starts_at,ends_at,status,"
                            "created_at,updated_at) VALUES (:id,:m,:p,:q,'running',:at,:end,'completed',now(),now())"
                        ),
                        {
                            "id": uuid4(),
                            "m": match_id,
                            "p": planner_id,
                            "q": partner_id,
                            "at": at,
                            "end": at + timedelta(hours=1),
                        },
                    )
            # What the unfixed client fetched:
            legacy_events = await ok("GET", "/events?mine=true&limit=50", planner)
            legacy_bookings = await ok(
                "GET", "/bookings?status=proposed,confirmed,completed,cancelled,declined,no_show&limit=50", planner
            )
            results["F2_legacy_first_50"] = {
                "events_total": legacy_events["total"],
                "future_event_in_first_50": future_event["id"] in {e["id"] for e in legacy_events["items"]},
                "bookings_total": legacy_bookings["total"],
                "confirmed_in_first_50": confirmed["id"] in {b["id"] for b in legacy_bookings["items"]},
                "proposed_in_first_50": proposed["id"] in {b["id"] for b in legacy_bookings["items"]},
            }
            # Segment contract (repair): upcoming/pending independent of history; past fully pageable.
            as_of = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            q = f"as_of={as_of}"
            ev_up = await ok("GET", f"/events?mine=true&segment=upcoming&{q}&limit=20", planner)
            bk_up = await ok("GET", f"/bookings?segment=upcoming&{q}&limit=20", planner)
            bk_pend = await ok("GET", f"/bookings?segment=pending&{q}&limit=20", planner)
            past_event_ids: list[str] = []
            past_booking_ids: list[str] = []
            for offset in range(0, 200, 20):
                page = await ok("GET", f"/events?mine=true&segment=past&{q}&limit=20&offset={offset}", planner)
                past_event_ids += [e["id"] for e in page["items"]]
                bpage = await ok("GET", f"/bookings?segment=past&{q}&limit=20&offset={offset}", planner)
                past_booking_ids += [b["id"] for b in bpage["items"]]
            record(
                "F2_segments_complete",
                [e["id"] for e in ev_up["items"]] == [future_event["id"]]
                and ev_up["total"] == 1
                and [b["id"] for b in bk_up["items"]] == [confirmed["id"]]
                and [b["id"] for b in bk_pend["items"]] == [proposed["id"]]
                and len(past_event_ids) == 55 == len(set(past_event_ids))
                and len(past_booking_ids) == 55 == len(set(past_booking_ids))
                and future_event["id"] not in past_event_ids,
                events_upcoming=[e["id"] for e in ev_up["items"]],
                events_upcoming_total=ev_up["total"],
                bookings_upcoming=[b["id"] for b in bk_up["items"]],
                bookings_pending=[b["id"] for b in bk_pend["items"]],
                past_events_seen=len(past_event_ids),
                past_events_unique=len(set(past_event_ids)),
                past_bookings_seen=len(past_booking_ids),
                past_bookings_unique=len(set(past_booking_ids)),
                expected={"future_event": future_event["id"], "confirmed": confirmed["id"], "proposed": proposed["id"]},
            )

            # ── F5: legacy offset-free booking payload under this process TZ ─
            day = (datetime.now(timezone.utc) + timedelta(days=10)).date().isoformat()
            code, b = await call(
                "POST",
                "/bookings",
                planner,
                {"match_id": match_id, "sport": "running", "starts_at": f"{day}T09:00:00", "ends_at": f"{day}T10:00:00"},
            )
            stored = b.get("starts_at") if code == 201 else None
            parsed = datetime.fromisoformat(stored.replace("Z", "+00:00")) if stored else None
            expected = datetime.fromisoformat(f"{day}T09:00:00+00:00")
            record(
                "F5_naive_payload_is_utc",
                code == 201 and parsed == expected,
                http=code,
                sent=f"{day}T09:00:00",
                stored=stored,
                expected=expected.isoformat(),
            )
            code, b2 = await call(
                "POST",
                "/bookings",
                planner,
                {
                    "match_id": match_id,
                    "sport": "running",
                    "starts_at": f"{day}T20:00:00+11:00",
                    "ends_at": f"{day}T21:00:00+11:00",
                },
            )
            stored2 = b2.get("starts_at") if code == 201 else None
            record(
                "F5_offset_payload_normalised",
                code == 201
                and datetime.fromisoformat(stored2.replace("Z", "+00:00"))
                == datetime.fromisoformat(f"{day}T09:00:00+00:00"),
                http=code,
                stored=stored2 if code == 201 else b2,
            )

    failed = sorted(k for k, v in results.items() if isinstance(v, dict) and v.get("status") == "FAIL")
    passed = sorted(k for k, v in results.items() if isinstance(v, dict) and v.get("status") == "PASS")
    results["_summary"] = {"failed": failed, "passed": passed}
    out.write_text(json.dumps(results, indent=2, default=str))
    print(json.dumps(results["_summary"], indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(Path(sys.argv[1]))))
