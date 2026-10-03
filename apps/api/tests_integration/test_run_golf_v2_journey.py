"""Run + golf v2 journeys on the migrated PostgreSQL/Redis stack.

Run separately from the SQLite unit suite, after `alembic upgrade head`,
with POSTGRES_URL / REDIS_URL pointing at disposable services. No dependency
overrides: real PostgreSQL, real Redis, real auth.

The database may already contain other users (earlier runs, seeded legacy
rows), so feed assertions are about the accounts created here, and the
pagination check compares against a snapshot of the full ordering.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import engine
from app.main import app


@pytest.fixture(autouse=True)
async def _fresh_pool() -> AsyncGenerator[None, None]:
    # As in test_event_capacity.py: each test gets its own event loop, so
    # drop pooled connections opened on a previous test's loop (without
    # closing them on the wrong loop) and one failure cannot cascade.
    await engine.dispose(close=False)
    yield


def _peer() -> tuple[str, int]:
    # /auth/register is rate limited per client IP (3/minute, Redis-backed).
    # The limiter stays enabled; each registration simply arrives from its
    # own synthetic peer address, as distinct real users would.
    octets = uuid4().bytes
    return f"10.{octets[0]}.{octets[1]}.{octets[2]}", 40000 + octets[3]


async def _register(client: AsyncClient, name: str, suburb: str = "Newtown") -> tuple[dict[str, str], str]:
    async with AsyncClient(transport=ASGITransport(app=app, client=_peer()), base_url="http://test") as signup:
        r = await signup.post(
            "/auth/register",
            json={"email": f"v2-{name.lower()}-{uuid4().hex[:10]}@example.com", "password": "integration-password-123"},
        )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = await client.get("/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    r = await client.put(
        "/users/me/profile", json={"display_name": name, "birth_year": 1990, "suburb": suburb}, headers=headers
    )
    assert r.status_code == 200, r.text
    return headers, me.json()["id"]


async def _sport(client: AsyncClient, headers: dict[str, str], body: dict) -> dict:
    r = await client.post("/users/me/sport-profiles", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _feed(client: AsyncClient, headers: dict[str, str], query: str) -> dict:
    r = await client.get(f"/discovery?{query}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _ids(feed: dict) -> list[str]:
    return [item["user_id"] for item in feed["items"]]


def _run(**fields) -> dict:
    return {
        "sport": "running",
        "level": "intermediate",
        "preferred_times": ["morning"],
        "preferences_version": 2,
        "run_pace_mode": "match_pace",
        "run_pace_min_sec_per_km": 330,
        "run_pace_max_sec_per_km": 390,
        "run_distances_km": [5, 10],
        "run_group_style": "stay_together",
        **fields,
    }


def _golf(**fields) -> dict:
    return {
        "sport": "golf",
        "level": "intermediate",
        "preferred_times": ["morning"],
        "preferences_version": 2,
        "golf_handicap_source": "none",
        "golf_experience": "played_rounds",
        "golf_partner_intents": ["similar_level"],
        **fields,
    }


async def test_running_journey_to_a_confirmed_session_and_old_client_safety() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            ana, ana_id = await _register(client, "Ana")
            ben, ben_id = await _register(client, "Ben", "Bondi")
            await _sport(client, ana, _run())
            await _sport(client, ben, _run(run_pace_min_sec_per_km=360, run_pace_max_sec_per_km=420))

            # "Restart the app": a fresh read returns the saved pace/intent.
            r = await client.get("/users/me/sport-profiles", headers=ana)
            running = next(sp for sp in r.json() if sp["sport"] == "running")
            assert running["preferences_version"] == 2
            assert (running["run_pace_min_sec_per_km"], running["run_pace_max_sec_per_km"]) == (330, 390)
            assert running["run_pace_mode"] == "match_pace"

            # Bilateral: each sees the other with the factual overlap.
            for viewer, other_id in ((ana, ben_id), (ben, ana_id)):
                feed = await _feed(client, viewer, "sport=running&limit=50")
                card = next(i for i in feed["items"] if i["user_id"] == other_id)
                assert card["compatibility"]["tier"] == "compatible"
                texts = [r["text"] for r in card["compatibility"]["reasons"]]
                assert "Pace ranges overlap at 6:00–6:30 /km" in texts

            # Mutual interest → existing match → chat → booking proposal → confirm.
            r1 = await client.post(
                "/discovery/actions", json={"target_user_id": ben_id, "action": "like", "sport": "running"}, headers=ana
            )
            r2 = await client.post(
                "/discovery/actions", json={"target_user_id": ana_id, "action": "like", "sport": "running"}, headers=ben
            )
            assert r1.json()["match_created"] is False
            assert r2.json()["match_created"] is True
            match_id = r2.json()["match_id"]
            r = await client.post(f"/matches/{match_id}/messages", json={"body": "Sat 7am Centennial?"}, headers=ana)
            assert r.status_code == 201, r.text
            r = await client.get(f"/matches/{match_id}/messages", headers=ben)
            assert r.status_code == 200 and any(m["body"] == "Sat 7am Centennial?" for m in r.json()["items"])

            start = datetime.now(timezone.utc) + timedelta(days=3)
            r = await client.post(
                "/bookings",
                json={
                    "match_id": match_id,
                    "sport": "running",
                    "starts_at": start.isoformat(),
                    "ends_at": (start + timedelta(hours=1)).isoformat(),
                    "location": "Centennial Park",
                },
                headers=ana,
            )
            assert r.status_code == 201, r.text
            booking_id = r.json()["id"]
            pending = await client.get("/bookings?status=proposed", headers=ben)
            assert booking_id in [b["id"] for b in pending.json()["items"]]
            r = await client.post(f"/bookings/{booking_id}/confirm", headers=ben)
            assert r.status_code == 200 and r.json()["status"] == "confirmed"
            for viewer in (ana, ben):
                confirmed = await client.get("/bookings?status=confirmed", headers=viewer)
                assert booking_id in [b["id"] for b in confirmed.json()["items"]]

            # An old client (legacy fields only) must not erase v2 preferences.
            r = await client.post(
                "/users/me/sport-profiles",
                json={"sport": "running", "level": "advanced", "preferred_times": ["evening"]},
                headers=ana,
            )
            assert r.status_code == 201, r.text
            after = r.json()
            assert after["level"] == "advanced"
            assert after["preferences_version"] == 2
            assert after["run_pace_min_sec_per_km"] == 330
            assert after["run_distances_km"] == [5.0, 10.0]


async def test_golf_bilateral_intents_on_postgres() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            bea, bea_id = await _register(client, "Bea")
            mentor, mentor_id = await _register(client, "Mentor")
            picky, picky_id = await _register(client, "Picky")
            legacy, legacy_id = await _register(client, "LegacyGolfer")
            await _sport(
                client,
                bea,
                _golf(level="beginner", golf_experience="range", golf_partner_intents=["learn_from_experienced"]),
            )
            expert = dict(
                level="advanced",
                golf_handicap_tenths=-21,  # +2.1 stored signed
                golf_handicap_source="official_index",
                golf_experience="regular",
            )
            await _sport(client, mentor, _golf(golf_partner_intents=["welcome_beginners"], **expert))
            await _sport(client, picky, _golf(golf_partner_intents=["similar_level"], **expert))
            await _sport(client, legacy, {"sport": "golf", "level": "advanced", "golf_club": "Moore Park"})

            bea_feed = await _feed(client, bea, "sport=golf&limit=50")
            by_id = {i["user_id"]: i for i in bea_feed["items"]}
            assert by_id[mentor_id]["compatibility"]["tier"] == "compatible"
            codes = {r["code"] for r in by_id[mentor_id]["compatibility"]["reasons"]}
            assert {"more_experienced", "welcomes_beginners"} <= codes
            caveats = {c["code"] for c in by_id[mentor_id]["compatibility"]["caveats"]}
            assert "handicap_self_reported" in caveats
            assert picky_id not in by_id  # the expert's similar-level rule is respected
            assert by_id[legacy_id]["compatibility"]["tier"] == "needs_setup"
            assert by_id[legacy_id]["compatibility"]["reasons"] == []
            # Compatible people are ranked before anyone without preferences.
            order = _ids(bea_feed)
            assert order.index(mentor_id) < order.index(legacy_id)

            picky_feed = await _feed(client, picky, "sport=golf&limit=50")
            assert bea_id not in _ids(picky_feed)
            legacy_feed = await _feed(client, legacy, "sport=golf&limit=50")
            assert legacy_feed["viewer_setup_required"] is True

            # Blocking (either direction) hides the profile.
            r = await client.post(f"/blocks/{bea_id}", headers=mentor)
            assert r.status_code == 201, r.text
            assert mentor_id not in _ids(await _feed(client, bea, "sport=golf&limit=50"))


async def test_learning_match_needs_the_mentors_explicit_consent_on_postgres() -> None:
    """Review F3 counterexample, persisted and served through /discovery."""
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            learner, learner_id = await _register(client, "Learner")
            mentor, mentor_id = await _register(client, "BroadMentor")
            await _sport(
                client,
                learner,
                _golf(
                    level="beginner",
                    golf_handicap_tenths=300,
                    golf_handicap_source="estimate",
                    golf_experience="range",
                    golf_partner_intents=["learn_from_experienced"],
                ),
            )
            mentor_golf = _golf(
                level="intermediate",
                golf_handicap_tenths=240,
                golf_handicap_source="estimate",
                golf_experience="regular",
                golf_partner_intents=["similar_level"],
                golf_similarity_tolerance_tenths=100,
            )
            await _sport(client, mentor, mentor_golf)

            # Excluded in both directions until the mentor says yes.
            assert mentor_id not in _ids(await _feed(client, learner, "sport=golf&limit=50"))
            assert learner_id not in _ids(await _feed(client, mentor, "sport=golf&limit=50"))

            for consent, consent_code in (("welcome_beginners", "welcomes_beginners"), ("any_level", "any_level")):
                stored = await _sport(
                    client, mentor, {**mentor_golf, "golf_partner_intents": ["similar_level", consent]}
                )
                assert stored["golf_partner_intents"] == ["similar_level", consent]
                learner_view = {i["user_id"]: i for i in (await _feed(client, learner, "sport=golf&limit=50"))["items"]}
                compat = learner_view[mentor_id]["compatibility"]
                assert compat["tier"] == "compatible"
                assert {r["code"] for r in compat["reasons"]} == {"more_experienced", consent_code, "time_overlap"}
                mentor_view = {i["user_id"]: i for i in (await _feed(client, mentor, "sport=golf&limit=50"))["items"]}
                assert {r["code"] for r in mentor_view[learner_id]["compatibility"]["reasons"]} == {
                    "learner_fit",
                    "time_overlap",
                }

            # Withdrawing consent excludes the pair again; blocking still wins.
            await _sport(client, mentor, mentor_golf)
            assert mentor_id not in _ids(await _feed(client, learner, "sport=golf&limit=50"))
            await _sport(client, mentor, {**mentor_golf, "golf_partner_intents": ["welcome_beginners"]})
            assert mentor_id in _ids(await _feed(client, learner, "sport=golf&limit=50"))
            r = await client.post(f"/blocks/{mentor_id}", headers=learner)
            assert r.status_code == 201, r.text
            assert mentor_id not in _ids(await _feed(client, learner, "sport=golf&limit=50"))
            assert learner_id not in _ids(await _feed(client, mentor, "sport=golf&limit=50"))


async def test_cursor_paging_survives_an_action_between_pages() -> None:
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            viewer, _ = await _register(client, "Pager")
            await _sport(client, viewer, _run(run_distances_km=None, run_group_style=None))
            for i in range(5):
                h, _ = await _register(client, f"Pace{i}")
                await _sport(client, h, _run(preferred_times=["morning"] if i % 2 else ["evening"]))

            full = _ids(await _feed(client, viewer, "sport=running&limit=50"))
            assert len(full) >= 5
            page1 = await _feed(client, viewer, "sport=running&limit=2")
            assert _ids(page1) == full[:2]
            r = await client.post(
                "/discovery/actions",
                json={"target_user_id": full[0], "action": "pass", "sport": "running"},
                headers=viewer,
            )
            assert r.status_code == 200, r.text
            seen = _ids(page1)
            cursor = page1["next_cursor"]
            while cursor:
                page = await _feed(client, viewer, f"sport=running&limit=2&cursor={cursor}")
                seen += _ids(page)
                cursor = page["next_cursor"]
            assert seen == full[: len(seen)]
            assert len(seen) == len(full)  # nothing skipped, nothing duplicated
