"""Idempotent demo fixtures for the local QA stack (run by scripts/qa/qa.py).

    QA_API_URL=http://127.0.0.1:8130 QA_DIR=/path/.qa POSTGRES_URL=…/sportsgang_qa \
      uv run python scripts/qa/seed_qa.py        # from apps/api

Accounts, profiles, preferences, the match, messages, bookings and sessions
are created through the running API (normal validation, auth and rate
limits — the seeder waits out 429s instead of disabling the limiter). Only
the 55+55 *past* sessions/bookings for the history scenario are inserted
with SQL, because the API never creates plans in the past.

Idempotent: every account logs in (or registers once), every fixture is
looked up first and only created when missing (or when its seeded date has
passed). Rows the tester changed are left as they are; `qa:reset -- --yes`
restores the original state. Everything created is recognisable as demo
data: `qa.<name>@example.com` accounts named "QA …", sessions titled
"QA …", locations prefixed "QA".

Writes (mode 600) in QA_DIR: credentials.json (shared demo password and
accounts), tokens.json (cached 7-day API tokens), manifest.json (fixture IDs
and expected results).
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import secrets
import sys
import time
from datetime import datetime, time as dtime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

SYDNEY = ZoneInfo("Australia/Sydney")
API = os.environ.get("QA_API_URL", "")
QA_DIR = Path(os.environ.get("QA_DIR", ""))
PG = os.environ.get("POSTGRES_URL", "")


def guard() -> None:
    host = urlparse(API).hostname or ""
    local_api = host in ("127.0.0.1", "localhost")
    if not local_api:
        try:
            local_api = ipaddress.ip_address(host).is_private
        except ValueError:
            local_api = False
    pg = urlparse(PG)
    problems = []
    if os.environ.get("APP_ENV") != "local":
        problems.append("APP_ENV must be local")
    if not local_api:
        problems.append(f"QA_API_URL must be a local/private address, got {API!r}")
    if pg.hostname != "127.0.0.1" or pg.path != "/sportsgang_qa":
        problems.append("POSTGRES_URL must be the local sportsgang_qa database")
    if not QA_DIR.is_dir():
        problems.append("QA_DIR must exist")
    if problems:
        sys.exit("refusing to seed: " + "; ".join(problems))


def private_json(name: str, data: object) -> None:
    path = QA_DIR / name
    path.write_text(json.dumps(data, indent=2, default=str) + "\n")
    os.chmod(path, 0o600)


def load_json(name: str) -> dict:
    path = QA_DIR / name
    return json.loads(path.read_text()) if path.exists() else {}


def sydney(days: int, hh: int, mm: int = 0) -> datetime:
    """A Sydney wall time `days` from today (Sydney calendar), as aware UTC."""
    today = datetime.now(SYDNEY).date()
    return datetime.combine(today + timedelta(days=days), dtime(hh, mm), tzinfo=SYDNEY).astimezone(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# ─── fixture definitions ────────────────────────────────────────────────────

RUN = {"sport": "running", "preferred_times": ["morning"], "preferences_version": 2}
GOLF = {"sport": "golf", "preferred_times": ["morning"], "preferences_version": 2}

ACCOUNTS: dict[str, dict] = {
    "alice": {
        "name": "QA Alice", "birth_year": 1992, "suburb": "Newtown",
        "role": "Main walkthrough runner + golf learner (estimate 30.0, range, wants to learn)",
        "sports": [
            {**RUN, "level": "intermediate", "run_pace_mode": "match_pace", "run_pace_min_sec_per_km": 330,
             "run_pace_max_sec_per_km": 375, "run_distances_km": [5, 10], "run_group_style": "stay_together"},
            {**GOLF, "level": "beginner", "golf_handicap_source": "estimate", "golf_handicap_tenths": 300,
             "golf_experience": "range", "golf_partner_intents": ["learn_from_experienced"]},
        ],
    },
    "bob": {
        "name": "QA Bob", "birth_year": 1988, "suburb": "Bondi",
        "role": "Host + Alice's match; pace 5:45–6:30; golf 12.0 official, welcomes beginners",
        "sports": [
            {**RUN, "level": "intermediate", "run_pace_mode": "match_pace", "run_pace_min_sec_per_km": 345,
             "run_pace_max_sec_per_km": 390, "run_distances_km": [5], "run_group_style": "stay_together"},
            {**GOLF, "level": "advanced", "golf_handicap_source": "official_index", "golf_handicap_tenths": 120,
             "golf_experience": "regular", "golf_partner_intents": ["welcome_beginners"]},
        ],
    },
    "cara": {
        "name": "QA Cara", "birth_year": 1990, "suburb": "Glebe",
        "role": "Social runner (no pace); golf similar-level only, 24.0 estimate, 10.0 tolerance (F3 counterexample)",
        "sports": [
            {**RUN, "level": "beginner", "run_pace_mode": "social"},
            {**GOLF, "level": "intermediate", "golf_handicap_source": "estimate", "golf_handicap_tenths": 240,
             "golf_experience": "regular", "golf_partner_intents": ["similar_level"],
             "golf_similarity_tolerance_tenths": 100},
        ],
    },
    "dan": {
        "name": "QA Dan", "birth_year": 1995, "suburb": "Coogee",
        "role": "Fast runner 4:00–4:30 (no overlap with Alice); hosts 22 extra public runs for paging",
        "sports": [
            {**RUN, "level": "advanced", "run_pace_mode": "match_pace", "run_pace_min_sec_per_km": 240,
             "run_pace_max_sec_per_km": 270, "run_distances_km": [10, 21.1], "run_group_style": "pace_groups"},
        ],
    },
    "fern": {
        "name": "QA Fern", "birth_year": 1993, "suburb": "Paddington",
        "role": "Runner 5:40–6:20 (overlaps Alice) — the 'Matching pace only' result",
        "sports": [
            {**RUN, "level": "intermediate", "run_pace_mode": "match_pace", "run_pace_min_sec_per_km": 340,
             "run_pace_max_sec_per_km": 380, "run_distances_km": [5], "run_group_style": "stay_together"},
        ],
    },
    "eve": {
        "name": "QA Eve", "birth_year": 1987, "suburb": "Annandale",
        "role": "Legacy running row without v2 preferences (honest 'hasn't set preferences' state)",
        "sports": [{"sport": "running", "level": "intermediate", "preferred_times": ["evening"]}],
    },
    "newbie": {
        "name": None, "role": "Registered, no profile: logs straight into onboarding (Step 1 of 4)", "sports": [],
    },
    "mod": {
        "name": "QA Mod Target", "birth_year": 1991, "suburb": "Surry Hills",
        "role": "Disposable: report/block from Alice, then delete this account (re-created by qa:seed)",
        "sports": [{**RUN, "level": "beginner", "run_pace_mode": "social"}],
    },
}


# ─── API client with the real rate limits ───────────────────────────────────


class Client:
    def __init__(self) -> None:
        self.http = httpx.Client(base_url=API, timeout=30)

    def request(self, method: str, path: str, token: str | None = None, **kw) -> httpx.Response:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        for _ in range(8):
            r = self.http.request(method, path, headers=headers, **kw)
            if r.status_code != 429:
                return r
            print(f"  rate limited on {path}; waiting 21s (limits stay enabled)", flush=True)
            time.sleep(21)
        return r

    def ok(self, method: str, path: str, token: str | None = None, expect: tuple[int, ...] = (200,), **kw):
        r = self.request(method, path, token, **kw)
        if r.status_code not in expect:
            sys.exit(f"{method} {path} → {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else None


def account_token(c: Client, key: str, password: str, tokens: dict) -> tuple[str, str]:
    email = f"qa.{key}@example.com"
    cached = tokens.get(key)
    if cached:
        me = c.request("GET", "/auth/me", cached["token"])
        if me.status_code == 200:
            return cached["token"], me.json()["id"]
    r = c.request("POST", "/auth/login", json={"email": email, "password": password})
    if r.status_code == 401:
        r = c.request("POST", "/auth/register", json={"email": email, "password": password})
        if r.status_code != 201:
            sys.exit(f"cannot register {email}: {r.status_code} {r.text[:200]}")
        print(f"  registered {email}")
    elif r.status_code != 200:
        sys.exit(f"cannot log in {email}: {r.status_code} {r.text[:200]}")
    token = r.json()["access_token"]
    uid = c.ok("GET", "/auth/me", token)["id"]
    tokens[key] = {"token": token, "user_id": uid}
    private_json("tokens.json", tokens)
    return token, uid


def ensure_profile(c: Client, token: str, spec: dict) -> None:
    if spec["name"] is None:
        return
    if c.request("GET", "/users/me/profile", token).status_code == 404:
        c.ok("PUT", "/users/me/profile", token,
             json={"display_name": spec["name"], "birth_year": spec["birth_year"], "suburb": spec["suburb"]})
    if c.request("GET", "/users/me/identity-preferences", token).status_code == 404:
        c.ok("PUT", "/users/me/identity-preferences", token,
             json={"open_to": ["any"], "age_range_min": 18, "age_range_max": 65, "max_distance_km": 50})
    have = {p["sport"] for p in c.ok("GET", "/users/me/sport-profiles", token)}
    for body in spec["sports"]:
        if body["sport"] not in have:  # never overwrite a tester's edits
            c.ok("POST", "/users/me/sport-profiles", token, expect=(201,), json=body)


def my_events(c: Client, token: str) -> list[dict]:
    items, offset = [], 0
    while True:
        page = c.ok("GET", f"/events?mine=true&limit=50&offset={offset}", token)
        items += page["items"]
        offset += 50
        if offset >= page["total"]:
            return items


def ensure_session(c: Client, token: str, uid: str, existing: list[dict], body: dict, *, cancelled=False) -> dict:
    now = datetime.now(timezone.utc)
    for e in existing:
        starts = datetime.fromisoformat(e["starts_at"].replace("Z", "+00:00"))
        if e["title"] == body["title"] and e["host_user_id"] == uid and starts > now:
            if (e["status"] == "cancelled") == cancelled:
                return e
    created = c.ok("POST", "/events", token, expect=(201,), json={"mode": "casual", **body})
    print(f"  created session {body['title']}")
    if cancelled:
        created = c.ok("POST", f"/events/{created['id']}/cancel", token)
    existing.append(created)
    return created


async def ensure_history(alice: str, bob: str, match_id: str) -> dict[str, int]:
    """55 completed past sessions and 55 completed past bookings for Alice (SQL; idempotent)."""
    engine = create_async_engine(PG.replace("postgresql://", "postgresql+asyncpg://", 1))
    try:
        async with engine.begin() as conn:
            have_events = (await conn.execute(
                text("SELECT count(*) FROM events WHERE host_user_id=:a AND title LIKE 'QA history run %'"),
                {"a": alice})).scalar_one()
            have_bookings = (await conn.execute(
                text("SELECT count(*) FROM bookings WHERE match_id=:m AND location='QA history: Centennial Park'"),
                {"m": match_id})).scalar_one()
            now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
            for i in range(have_events, 55):
                at = now - timedelta(days=150 - 2 * i, hours=3)
                eid = uuid4()
                await conn.execute(text(
                    "INSERT INTO events (id, host_user_id, title, sport, mode, starts_at, location_text, capacity,"
                    " visibility, status, created_at, updated_at) VALUES (:id, :h, :t, 'running', 'casual', :at,"
                    " 'QA history: Centennial Park', 4, 'public', 'completed', now(), now())"),
                    {"id": eid, "h": alice, "t": f"QA history run {i + 1:02d}", "at": at})
                await conn.execute(text(
                    "INSERT INTO event_participants (id, event_id, user_id, status, joined_at)"
                    " VALUES (:id, :e, :u, 'joined', :at)"), {"id": uuid4(), "e": eid, "u": alice, "at": at})
            for i in range(have_bookings, 55):
                at = now - timedelta(days=149 - 2 * i, hours=5)
                await conn.execute(text(
                    "INSERT INTO bookings (id, match_id, proposer_id, partner_id, sport, starts_at, ends_at,"
                    " location, status, created_at, updated_at) VALUES (:id, :m, :p, :q, 'running', :at, :end,"
                    " 'QA history: Centennial Park', 'completed', now(), now())"),
                    {"id": uuid4(), "m": match_id, "p": alice, "q": bob, "at": at, "end": at + timedelta(hours=1)})
        return {"history_sessions_added": max(0, 55 - have_events), "history_bookings_added": max(0, 55 - have_bookings)}
    finally:
        await engine.dispose()


def main() -> None:
    guard()
    creds = load_json("credentials.json")
    if not creds.get("password"):
        creds["password"] = "QaDemo-" + secrets.token_hex(3)
    creds["accounts"] = {
        key: {"email": f"qa.{key}@example.com", "display_name": spec["name"], "role": spec["role"]}
        for key, spec in ACCOUNTS.items()
    }
    creds["note"] = "Local QA stack only (sportsgang_qa). Every account uses the same password."
    private_json("credentials.json", creds)
    tokens = load_json("tokens.json")
    c = Client()

    ids: dict[str, str] = {}
    tok: dict[str, str] = {}
    for key, spec in ACCOUNTS.items():
        tok[key], ids[key] = account_token(c, key, creds["password"], tokens)
        ensure_profile(c, tok[key], spec)

    # Alice ↔ Bob: mutual interest → match + chat.
    def find_match() -> str | None:
        for m in c.ok("GET", "/matches?limit=50", tok["alice"])["items"]:
            if ids["bob"] in (m["user1_id"], m["user2_id"]):
                return m["id"]
        return None

    match_id = find_match()
    if match_id is None:
        for a, b in (("alice", "bob"), ("bob", "alice")):
            c.request("POST", "/discovery/actions", tok[a],
                      json={"target_user_id": ids[b], "action": "like", "sport": "running"})
        match_id = find_match() or sys.exit("could not create the Alice/Bob match")
        print("  created match QA Alice ↔ QA Bob")
    if not c.ok("GET", f"/matches/{match_id}/messages?limit=5", tok["alice"])["items"]:
        c.ok("POST", f"/matches/{match_id}/messages", tok["bob"], expect=(201,),
             json={"body": "Hi Alice — keen for an easy run this week? (QA demo chat)"})

    # Bookings: one pending proposal from Bob, one confirmed session.
    as_of = iso(datetime.now(timezone.utc))
    pending = c.ok("GET", f"/bookings?match_id={match_id}&segment=pending&as_of={as_of}&limit=50", tok["alice"])
    pend = next((b for b in pending["items"] if b["proposer_id"] == ids["bob"]), None)
    if pend is None:
        pend = c.ok("POST", "/bookings", tok["bob"], expect=(201,), json={
            "match_id": match_id, "sport": "running", "starts_at": iso(sydney(4, 6, 30)),
            "ends_at": iso(sydney(4, 7, 30)), "location": "QA Centennial Park, Paddington Gates"})
        print("  created pending booking (Bob → Alice)")
    upcoming = c.ok("GET", f"/bookings?match_id={match_id}&segment=upcoming&as_of={as_of}&limit=50", tok["alice"])
    conf = upcoming["items"][0] if upcoming["items"] else None
    if conf is None:
        conf = c.ok("POST", "/bookings", tok["alice"], expect=(201,), json={
            "match_id": match_id, "sport": "running", "starts_at": iso(sydney(6, 7, 0)),
            "ends_at": iso(sydney(6, 8, 0)), "location": "QA Bondi Beach promenade"})
        conf = c.ok("POST", f"/bookings/{conf['id']}/confirm", tok["bob"])
        print("  created confirmed booking (Alice ↔ Bob)")

    # Group sessions.
    bob_events = my_events(c, tok["bob"])
    sessions = {
        "run_spare": ensure_session(c, tok["bob"], ids["bob"], bob_events, {
            "title": "QA Bondi sunrise 5k", "sport": "running", "starts_at": iso(sydney(2, 6, 30)),
            "location_text": "Bondi Pavilion", "capacity": 6,
            "description": "QA demo session. Easy coastal loop, regroup at the pavilion.",
            "run_details": {"distance_km": 5, "pace_mode": "target_pace", "pace_min_sec_per_km": 345,
                            "pace_max_sec_per_km": 375, "group_style": "stay_together"}}),
        "golf_one_place": ensure_session(c, tok["bob"], ids["bob"], bob_events, {
            "title": "QA Moore Park 9", "sport": "golf", "starts_at": iso(sydney(3, 7, 30)),
            "location_text": "Moore Park Golf", "capacity": 2,
            "golf_details": {"holes": 9, "tee_time_status": "planning", "estimated_cost_cents": 3500,
                             "beginners_welcome": True}}),
        "run_full": ensure_session(c, tok["bob"], ids["bob"], bob_events, {
            "title": "QA Full Centennial 10k", "sport": "running", "starts_at": iso(sydney(5, 6, 0)),
            "location_text": "Centennial Park, Paddington Gates", "capacity": 2,
            "run_details": {"distance_km": 10, "pace_mode": "target_pace", "pace_min_sec_per_km": 345,
                            "pace_max_sec_per_km": 390, "group_style": "stay_together"}}),
        "run_cancelled": ensure_session(c, tok["bob"], ids["bob"], bob_events, {
            "title": "QA Cancelled Sunday run", "sport": "running", "starts_at": iso(sydney(4, 7, 0)),
            "location_text": "Rushcutters Bay Park", "capacity": 4,
            "run_details": {"distance_km": 8, "pace_mode": "social", "group_style": "regroup_at_finish"}},
            cancelled=True),
    }
    full = sessions["run_full"]
    if full["participant_count"] < full["capacity"] and full["status"] == "open":
        r = c.request("POST", f"/events/{full['id']}/join", tok["cara"])
        if r.status_code == 200:
            sessions["run_full"] = r.json()
    dan_events = my_events(c, tok["dan"])
    extra = [
        ensure_session(c, tok["dan"], ids["dan"], dan_events, {
            "title": f"QA Extra run {n:02d}", "sport": "running", "starts_at": iso(sydney(6 + n, 18, 0)),
            "location_text": "Coogee Beach steps", "capacity": 8,
            "run_details": {"distance_km": 6, "pace_mode": "social", "group_style": "pace_groups"}})
        for n in range(1, 23)
    ]

    history = asyncio.run(ensure_history(ids["alice"], ids["bob"], match_id))

    manifest = {
        "seeded_at_utc": iso(datetime.now(timezone.utc)),
        "api": API,
        "credentials_file": str(QA_DIR / "credentials.json"),
        "accounts": {k: {"email": f"qa.{k}@example.com", "user_id": ids[k], "display_name": s["name"],
                         "role": s["role"]} for k, s in ACCOUNTS.items()},
        "match_alice_bob": match_id,
        "bookings": {"pending_from_bob": {"id": pend["id"], "starts_at": pend["starts_at"]},
                     "confirmed": {"id": conf["id"], "starts_at": conf["starts_at"]}},
        "sessions": {k: {"id": v["id"], "title": v["title"], "starts_at": v["starts_at"], "status": v["status"],
                         "capacity": v["capacity"], "participant_count": v["participant_count"]}
                     for k, v in sessions.items()},
        "extra_public_runs": len(extra),
        "history": "55 completed past sessions + 55 completed past bookings for QA Alice",
        "history_added_this_run": history,
        "expectations": {
            "alice_running_partners": "Fern compatible (pace overlap); Cara and QA Mod Target 'Pace not confirmed'; "
                                      "Eve needs setup; Dan excluded (4:00–4:30 vs 5:30–6:15); Bob hidden (already matched)",
            "alice_strict_pace": "only QA Fern",
            "alice_golf_partners": "QA Bob (learning route: more experienced + welcomes beginners); "
                                   "QA Cara absent (similar-level only — no beginner consent)",
            "explore_running_sessions": "QA Bondi sunrise 5k (6 runners, spots left), QA Full Centennial 10k (Full), "
                                        "22 QA Extra runs → 'Show more sessions'; cancelled run not listed",
            "explore_golf_sessions": "QA Moore Park 9 — 2 golfers · 1 spot left",
            "alice_my_plans": "Upcoming: confirmed booking; Pending (1): Bob's proposal; Past: 110 history rows",
        },
    }
    private_json("manifest.json", manifest)
    print(json.dumps({"accounts": len(ids), "match": match_id, "sessions": len(sessions) + len(extra), **history}))


if __name__ == "__main__":
    main()
