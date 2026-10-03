"""Seed the disposable native-gate stack (local API on 127.0.0.1:8031).

    FIX_NATIVE_PASSWORD=… POSTGRES_URL=…/fix_native \
      uv run python ../../docs/run-golf-v2/fix-evidence/seed_native.py OUT.json

Creates three accounts through the real API — Alice (the simulator viewer),
Bob (host / partner) and Cara — with v2 running and golf preferences, a
running match between Alice and Bob, Bob's running session (capacity 4)
and golf round (capacity 2), and 55 completed past sessions and bookings
for Alice inserted with SQL (the API never creates past plans). The
password comes from FIX_NATIVE_PASSWORD and is not written out.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

API = "http://127.0.0.1:8031"
URL = os.environ.get("POSTGRES_URL", "")
PASSWORD = os.environ.get("FIX_NATIVE_PASSWORD", "")
if "@127.0.0.1:55453/fix_native" not in URL or not PASSWORD:
    sys.exit("set POSTGRES_URL to the disposable fix_native database and FIX_NATIVE_PASSWORD")

NOW = datetime.now(timezone.utc).replace(second=0, microsecond=0)
TAG = uuid4().hex[:6]


async def insert_history(alice: str, bob: str, match_id: str) -> None:
    engine = create_async_engine(URL.replace("postgresql://", "postgresql+asyncpg://", 1))
    try:
        async with engine.begin() as conn:
            for i in range(55):
                at = NOW - timedelta(days=120 - i)
                eid = uuid4()
                await conn.execute(
                    text(
                        "INSERT INTO events (id, host_user_id, title, sport, mode, starts_at, location_text, capacity,"
                        " visibility, status, created_at, updated_at) VALUES (:id, :h, :t, 'running', 'casual', :at,"
                        " 'Centennial Park', 4, 'public', 'completed', now(), now())"
                    ),
                    {"id": eid, "h": alice, "t": f"Past run {i + 1}", "at": at},
                )
                await conn.execute(
                    text(
                        "INSERT INTO event_participants (id, event_id, user_id, status, joined_at)"
                        " VALUES (:id, :e, :u, 'joined', now())"
                    ),
                    {"id": uuid4(), "e": eid, "u": alice},
                )
                await conn.execute(
                    text(
                        "INSERT INTO bookings (id, match_id, proposer_id, partner_id, sport, starts_at, ends_at,"
                        " location, status, created_at, updated_at) VALUES (:id, :m, :p, :q, 'running', :at, :end,"
                        " 'Centennial Park', 'completed', now(), now())"
                    ),
                    {"id": uuid4(), "m": match_id, "p": alice, "q": bob, "at": at, "end": at + timedelta(hours=1)},
                )
    finally:
        await engine.dispose()


def main(out: Path) -> None:
    c = httpx.Client(base_url=API, timeout=30)

    def ok(r: httpx.Response, code: int = 200) -> dict:
        assert r.status_code == code, (r.request.url, r.status_code, r.text)
        return r.json() if r.content else {}

    accounts: dict[str, dict] = {}
    for name, suburb in (("Alice", "Newtown"), ("Bob", "Bondi"), ("Cara", "Glebe")):
        email = f"native-{name.lower()}-{TAG}@example.com"
        token = ok(c.post("/auth/register", json={"email": email, "password": PASSWORD}), 201)["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        uid = ok(c.get("/auth/me", headers=h))["id"]
        ok(c.put("/users/me/profile", json={"display_name": name, "birth_year": 1991, "suburb": suburb}, headers=h))
        accounts[name] = {"id": uid, "email": email, "h": h}

    def sport(name: str, body: dict) -> None:
        base = {"level": "intermediate", "preferred_times": ["morning"], "preferences_version": 2}
        ok(c.post("/users/me/sport-profiles", json={**base, **body}, headers=accounts[name]["h"]), 201)

    sport(
        "Alice",
        {
            "sport": "running",
            "run_pace_mode": "match_pace",
            "run_pace_min_sec_per_km": 330,
            "run_pace_max_sec_per_km": 375,
            "run_distances_km": [5, 10],
            "run_group_style": "stay_together",
        },
    )
    sport(
        "Alice",
        {
            "sport": "golf",
            "level": "beginner",
            "golf_handicap_source": "none",
            "golf_experience": "range",
            "golf_partner_intents": ["learn_from_experienced"],
        },
    )
    sport(
        "Bob",
        {
            "sport": "running",
            "run_pace_mode": "match_pace",
            "run_pace_min_sec_per_km": 345,
            "run_pace_max_sec_per_km": 390,
            "run_distances_km": [5],
            "run_group_style": "stay_together",
        },
    )
    sport(
        "Bob",
        {
            "sport": "golf",
            "golf_handicap_source": "official_index",
            "golf_handicap_tenths": 120,
            "golf_experience": "regular",
            "golf_partner_intents": ["welcome_beginners"],
        },
    )
    sport("Cara", {"sport": "running", "run_pace_mode": "social"})
    sport(
        "Cara",
        {
            "sport": "golf",
            "golf_handicap_source": "estimate",
            "golf_handicap_tenths": 240,
            "golf_experience": "regular",
            "golf_partner_intents": ["similar_level"],
            "golf_similarity_tolerance_tenths": 100,
        },
    )

    for a, b in (("Alice", "Bob"), ("Bob", "Alice")):
        liked = ok(
            c.post(
                "/discovery/actions",
                json={"target_user_id": accounts[b]["id"], "action": "like", "sport": "running"},
                headers=accounts[a]["h"],
            )
        )
    match_id = liked["match_id"]

    def session(body: dict) -> str:
        return ok(c.post("/events", json={"mode": "casual", **body}, headers=accounts["Bob"]["h"]), 201)["id"]

    run_id = session(
        {
            "title": "Bondi sunrise 5k",
            "sport": "running",
            "starts_at": (NOW + timedelta(days=2)).isoformat(),
            "location_text": "Bondi Pavilion",
            "capacity": 4,
            "run_details": {
                "distance_km": 5,
                "pace_mode": "target_pace",
                "pace_min_sec_per_km": 345,
                "pace_max_sec_per_km": 375,
                "group_style": "stay_together",
            },
        }
    )
    golf_id = session(
        {
            "title": "Moore Park 9",
            "sport": "golf",
            "starts_at": (NOW + timedelta(days=3)).isoformat(),
            "location_text": "Moore Park Golf",
            "capacity": 2,
            "golf_details": {"holes": 9, "tee_time_status": "planning", "beginners_welcome": True},
        }
    )
    asyncio.run(insert_history(accounts["Alice"]["id"], accounts["Bob"]["id"], match_id))

    result = {
        "seeded_at_utc": NOW.isoformat(),
        "accounts": {k: {"id": v["id"], "email": v["email"]} for k, v in accounts.items()},
        "match_id": match_id,
        "bob_run_id": run_id,
        "bob_golf_round_id": golf_id,
        "alice_history": "55 completed past sessions and 55 completed past bookings",
    }
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
