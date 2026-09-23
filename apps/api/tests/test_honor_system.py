"""Honor System MVP tests using in-memory SQLite.

Covers:
  * new user gets a default rank profile
  * ranking list sorts by rating desc
  * winner and loser ratings update after a result
  * first honor title assignment is recorded in honor_history
  * current holder losing transfers the title to the winner
  * current holder not involved → no transfer
  * /rankings endpoint returns expected sorted data
  * /honors endpoint returns the current holder (or null pre-award)
  * /honors/me returns the titles the user currently holds
  * regression: an unrelated authed user cannot mutate two other
    users' Honor/Rank state through the public API

Match results are driven by calling
``record_match_result_for_honor`` directly. The previous public
``POST /honors/result`` endpoint was removed because it let any
authenticated user mutate two other users' rankings, wins/losses,
streaks, title holders, and honor history — see the router module for
the full rationale.
"""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models.honor_system import (
    DEFAULT_RATING,
    RATING_LOSS_DELTA,
    RATING_WIN_DELTA,
    HonorHistory,
    HonorTitle,
    RankProfile,
)
from app.services.honor_system import record_match_result_for_honor

# Import every model so Base.metadata.create_all builds the full schema.
from app.models import (  # noqa: F401
    booking,
    chat,
    event,
    honor_system,
    match,
    profile,
    rank,
    safety,
    user,
    venue,
)


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        yield session


async def _override_get_redis() -> AsyncGenerator:
    mock = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.aclose = AsyncMock()
    yield mock


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _wipe_state() -> None:
    """Reset honor-system rows between tests so they don't bleed."""
    async with _TestSession() as db:
        await db.execute(delete(HonorHistory))
        await db.execute(delete(HonorTitle))
        await db.execute(delete(RankProfile))
        await db.commit()


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post("/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _record_result(
    *,
    winner_user_id: str,
    loser_user_id: str,
    sport: str = "tennis",
    area: str = "annandale",
    source_match_id: str | None = None,
) -> dict:
    """
    Invoke the service directly — tests stand in for the future
    verified challenge/tournament/group-event result hook that owns
    the only legitimate path to mutate honor state.
    """
    async with _TestSession() as db:
        response = await record_match_result_for_honor(
            db,
            winner_user_id=UUID(winner_user_id),
            loser_user_id=UUID(loser_user_id),
            sport=sport,
            area=area,
            source_match_id=UUID(source_match_id) if source_match_id else None,
        )
    return response.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Rank profile defaults
# ---------------------------------------------------------------------------


async def test_new_user_gets_default_rank_profile_without_persisting(
    client: AsyncClient,
) -> None:
    """
    Regression for the Codex APPROVE-WITH-FIXES finding on
    ``GET /rankings/me``.

    A brand-new user must receive the default read model (baseline
    rating, zero counts) WITHOUT a RankProfile row being inserted. The
    public Honor/Rank API is read-only; the only legitimate writer is
    :func:`record_match_result_for_honor`, called from a future
    verified-result hook.
    """
    await _wipe_state()
    token, uid = await _register(client, "hs_default@example.com")

    # Pre-condition: the DB has no profile for this user.
    async with _TestSession() as db:
        before = list((await db.execute(select(RankProfile).where(RankProfile.user_id == UUID(uid)))).scalars().all())
    assert before == []

    r = await client.get(
        "/rankings/me",
        params={"sport": "tennis", "area": "annandale"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_id"] == uid
    assert body["sport"] == "tennis"
    assert body["area"] == "annandale"
    assert body["rating"] == DEFAULT_RATING
    assert body["wins"] == 0
    assert body["losses"] == 0
    assert body["streak"] == 0
    assert body["last_played_at"] is None
    # The non-persisted default model has no DB-assigned identifiers.
    assert body["id"] is None
    assert body["created_at"] is None
    assert body["updated_at"] is None

    # Post-condition: still no profile row — GET did not insert.
    async with _TestSession() as db:
        after = list((await db.execute(select(RankProfile).where(RankProfile.user_id == UUID(uid)))).scalars().all())
    assert after == []


# ---------------------------------------------------------------------------
# Ranking list ordering
# ---------------------------------------------------------------------------


async def test_ranking_list_sorts_by_rating_descending(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "hs_sort_a@example.com")
    _, uid_b = await _register(client, "hs_sort_b@example.com")
    _, uid_c = await _register(client, "hs_sort_c@example.com")

    # Seed profiles directly. GET /rankings/me is read-only and does
    # not persist, so the leaderboard can't materialise its own rows.
    async with _TestSession() as db:
        for uid, rating in ((uid_a, 1300), (uid_b, 1100), (uid_c, 1500)):
            db.add(
                RankProfile(
                    user_id=UUID(uid),
                    sport="tennis",
                    area="annandale",
                    rating=rating,
                )
            )
        await db.commit()

    r = await client.get(
        "/rankings",
        params={"sport": "tennis", "area": "annandale"},
        headers=_auth(token_a),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sport"] == "tennis"
    assert body["area"] == "annandale"
    assert body["total"] == 3
    user_ids = [item["user_id"] for item in body["items"]]
    ratings = [item["rating"] for item in body["items"]]
    ranks = [item["rank"] for item in body["items"]]
    assert user_ids == [uid_c, uid_a, uid_b]
    assert ratings == [1500, 1300, 1100]
    assert ranks == [1, 2, 3]


async def test_rankings_endpoint_scoped_by_sport_and_area(
    client: AsyncClient,
) -> None:
    """Profiles in a different (sport, area) must not bleed into a ladder."""
    await _wipe_state()
    token, uid = await _register(client, "hs_scope@example.com")

    # Seed profiles directly — GET /rankings/me no longer persists.
    async with _TestSession() as db:
        db.add(
            RankProfile(
                user_id=UUID(uid),
                sport="tennis",
                area="annandale",
                rating=DEFAULT_RATING,
            )
        )
        db.add(
            RankProfile(
                user_id=UUID(uid),
                sport="badminton",
                area="newtown",
                rating=DEFAULT_RATING,
            )
        )
        await db.commit()

    tennis = (
        await client.get(
            "/rankings",
            params={"sport": "tennis", "area": "annandale"},
            headers=_auth(token),
        )
    ).json()
    badminton = (
        await client.get(
            "/rankings",
            params={"sport": "badminton", "area": "newtown"},
            headers=_auth(token),
        )
    ).json()
    empty = (
        await client.get(
            "/rankings",
            params={"sport": "running", "area": "sydney"},
            headers=_auth(token),
        )
    ).json()

    assert tennis["total"] == 1 and tennis["items"][0]["user_id"] == uid
    assert badminton["total"] == 1 and badminton["items"][0]["user_id"] == uid
    assert empty["total"] == 0 and empty["items"] == []


# ---------------------------------------------------------------------------
# Match result: rating updates (service-driven)
# ---------------------------------------------------------------------------


async def test_winner_and_loser_ratings_update_after_result(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    _, uid_a = await _register(client, "hs_rt_a@example.com")
    _, uid_b = await _register(client, "hs_rt_b@example.com")

    body = await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)

    assert body["winner_profile"]["rating"] == DEFAULT_RATING + RATING_WIN_DELTA
    assert body["winner_profile"]["wins"] == 1
    assert body["winner_profile"]["losses"] == 0
    assert body["winner_profile"]["streak"] == 1
    assert body["winner_profile"]["last_played_at"] is not None

    assert body["loser_profile"]["rating"] == DEFAULT_RATING - RATING_LOSS_DELTA
    assert body["loser_profile"]["wins"] == 0
    assert body["loser_profile"]["losses"] == 1
    assert body["loser_profile"]["streak"] == 0
    assert body["loser_profile"]["last_played_at"] is not None


async def test_winner_streak_increments_and_loser_streak_resets(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    _, uid_a = await _register(client, "hs_st_a@example.com")
    _, uid_b = await _register(client, "hs_st_b@example.com")

    # A beats B twice — A.streak should reach 2.
    await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)
    after_two = await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)
    assert after_two["winner_profile"]["streak"] == 2
    assert after_two["loser_profile"]["streak"] == 0

    # Now B beats A → A.streak resets to 0, B.streak becomes 1.
    after_swap = await _record_result(winner_user_id=uid_b, loser_user_id=uid_a)
    assert after_swap["winner_profile"]["streak"] == 1  # B
    assert after_swap["loser_profile"]["streak"] == 0  # A


async def test_loser_rating_floors_at_zero(client: AsyncClient) -> None:
    """Loser's rating cannot drop below zero."""
    await _wipe_state()
    _, uid_a = await _register(client, "hs_floor_a@example.com")
    _, uid_b = await _register(client, "hs_floor_b@example.com")

    # Seed B with a low rating so the next loss would underflow.
    # A's profile is auto-created at the baseline by the service when
    # the result lands — no read-side priming required.
    async with _TestSession() as db:
        db.add(
            RankProfile(
                user_id=UUID(uid_b),
                sport="tennis",
                area="annandale",
                rating=5,
            )
        )
        await db.commit()

    body = await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)
    assert body["loser_profile"]["rating"] == 0


# ---------------------------------------------------------------------------
# Match result: honor title creation + transfer + history (service-driven)
# ---------------------------------------------------------------------------


async def test_first_honor_title_assignment_is_recorded_in_history(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    _, uid_a = await _register(client, "hs_first_a@example.com")
    _, uid_b = await _register(client, "hs_first_b@example.com")

    body = await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)

    assert body["transferred"] is True
    title = body["honor_title"]
    assert title["title_name"] == "Annandale Tennis Champion"
    assert title["current_holder_user_id"] == uid_a
    assert title["active"] is True

    entry = body["history_entry"]
    assert entry is not None
    assert entry["previous_holder_user_id"] is None
    assert entry["new_holder_user_id"] == uid_a
    assert entry["honor_title_id"] == title["id"]
    assert entry["source_match_id"] is None

    # And the ledger row is persisted.
    async with _TestSession() as db:
        rows = list((await db.execute(select(HonorHistory))).scalars().all())
    assert len(rows) == 1


async def test_current_holder_losing_transfers_title_to_winner(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    _, uid_a = await _register(client, "hs_xfer_a@example.com")
    _, uid_b = await _register(client, "hs_xfer_b@example.com")

    # Round 1: A becomes inaugural holder.
    await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)
    # Round 2: A loses to B → title transfers.
    second = await _record_result(winner_user_id=uid_b, loser_user_id=uid_a)
    assert second["transferred"] is True
    assert second["honor_title"]["current_holder_user_id"] == uid_b
    assert second["history_entry"]["previous_holder_user_id"] == uid_a
    assert second["history_entry"]["new_holder_user_id"] == uid_b

    async with _TestSession() as db:
        history_rows = list((await db.execute(select(HonorHistory))).scalars().all())
    assert len(history_rows) == 2


async def test_current_holder_not_involved_does_not_transfer(
    client: AsyncClient,
) -> None:
    """A match between two non-champions must not move the title."""
    await _wipe_state()
    _, uid_a = await _register(client, "hs_noop_a@example.com")
    _, uid_b = await _register(client, "hs_noop_b@example.com")
    _, uid_c = await _register(client, "hs_noop_c@example.com")

    # A is champion.
    await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)
    # C beats B — champion A wasn't in the match → title stays.
    second = await _record_result(winner_user_id=uid_c, loser_user_id=uid_b)
    assert second["transferred"] is False
    assert second["history_entry"] is None
    assert second["honor_title"]["current_holder_user_id"] == uid_a

    async with _TestSession() as db:
        history_rows = list((await db.execute(select(HonorHistory))).scalars().all())
    # Only the inaugural award row exists.
    assert len(history_rows) == 1


async def test_champion_defending_keeps_title_without_history_row(
    client: AsyncClient,
) -> None:
    """When the champion wins, the title stays — no history row added."""
    await _wipe_state()
    _, uid_a = await _register(client, "hs_def_a@example.com")
    _, uid_b = await _register(client, "hs_def_b@example.com")

    await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)
    second = await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)
    assert second["transferred"] is False
    assert second["history_entry"] is None
    assert second["honor_title"]["current_holder_user_id"] == uid_a

    async with _TestSession() as db:
        history_rows = list((await db.execute(select(HonorHistory))).scalars().all())
    assert len(history_rows) == 1


# ---------------------------------------------------------------------------
# Endpoint behavior
# ---------------------------------------------------------------------------


async def test_honors_endpoint_returns_null_before_first_match(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token, _ = await _register(client, "hs_pre@example.com")
    r = await client.get(
        "/honors",
        params={"sport": "tennis", "area": "annandale"},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    assert r.json() is None


async def test_honors_endpoint_returns_expected_current_holder(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "hs_curr_a@example.com")
    _, uid_b = await _register(client, "hs_curr_b@example.com")

    await _record_result(winner_user_id=uid_a, loser_user_id=uid_b)

    r = await client.get(
        "/honors",
        params={"sport": "tennis", "area": "annandale"},
        headers=_auth(token_a),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title_name"] == "Annandale Tennis Champion"
    assert body["current_holder_user_id"] == uid_a
    assert body["active"] is True


async def test_honors_me_returns_empty_list_when_user_holds_no_titles(
    client: AsyncClient,
) -> None:
    """
    Belt-and-suspenders: a brand-new user with zero honors must get
    ``200 []``, not 404 / 500 / null. This is the empty-state contract
    the mobile ProfileScreen relies on for `myTitles` rendering.
    """
    await _wipe_state()
    token, _ = await _register(client, "hs_me_empty@example.com")
    r = await client.get("/honors/me", headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json() == []


async def test_honors_me_returns_titles_held_by_user(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "hs_me_a@example.com")
    _, uid_b = await _register(client, "hs_me_b@example.com")
    _, uid_c = await _register(client, "hs_me_c@example.com")

    # A wins tennis@annandale and badminton@newtown.
    await _record_result(winner_user_id=uid_a, loser_user_id=uid_b, sport="tennis", area="annandale")
    await _record_result(winner_user_id=uid_a, loser_user_id=uid_c, sport="badminton", area="newtown")

    r = await client.get("/honors/me", headers=_auth(token_a))
    assert r.status_code == 200, r.text
    titles = r.json()
    names = sorted(t["title_name"] for t in titles)
    assert names == ["Annandale Tennis Champion", "Newtown Badminton Champion"]
    for t in titles:
        assert t["current_holder_user_id"] == uid_a


# ---------------------------------------------------------------------------
# Auth + validation guards
# ---------------------------------------------------------------------------


async def test_rankings_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/rankings/me", params={"sport": "tennis", "area": "annandale"})
    assert r.status_code in (401, 403)


async def test_service_rejects_self_match(client: AsyncClient) -> None:
    """The service refuses winner == loser. Validated at the service
    layer because the public POST route no longer exists."""
    await _wipe_state()
    _, uid = await _register(client, "hs_self@example.com")
    with pytest.raises(HTTPException) as exc_info:
        async with _TestSession() as db:
            await record_match_result_for_honor(
                db,
                winner_user_id=UUID(uid),
                loser_user_id=UUID(uid),
                sport="tennis",
                area="annandale",
            )
    assert exc_info.value.status_code == 422


# ---------------------------------------------------------------------------
# Authorization regression — the Codex BLOCK that this fix addresses
# ---------------------------------------------------------------------------


async def test_unrelated_user_cannot_mutate_honor_state_via_public_api(
    client: AsyncClient,
) -> None:
    """
    Regression for the Codex BLOCK on POST /honors/result.

    A normal authenticated user (unrelated to either combatant) must not
    be able to push rating, win/loss, streak, title-holder, or honor
    history changes for two other users. The previous public POST has
    been removed; any future verified-result hook must call the service
    directly, never accept a public user-supplied body.

    The test does NOT assert only on status code — it re-reads the
    full state from the DB after the attempt and proves nothing
    changed.
    """
    await _wipe_state()
    _, uid_winner = await _register(client, "hs_sec_winner@example.com")
    _, uid_loser = await _register(client, "hs_sec_loser@example.com")
    unrelated_token, _ = await _register(client, "hs_sec_unrelated@example.com")

    # Seed initial state via the service so the loser holds the title.
    # The service is the legitimate integration point; this stands in
    # for the future verified-result hook.
    await _record_result(
        winner_user_id=uid_loser,
        loser_user_id=uid_winner,
        sport="tennis",
        area="annandale",
    )

    # Snapshot baseline state.
    async with _TestSession() as db:
        winner_before = (
            await db.execute(
                select(RankProfile).where(
                    RankProfile.user_id == UUID(uid_winner),
                    RankProfile.sport == "tennis",
                    RankProfile.area == "annandale",
                )
            )
        ).scalar_one()
        loser_before = (
            await db.execute(
                select(RankProfile).where(
                    RankProfile.user_id == UUID(uid_loser),
                    RankProfile.sport == "tennis",
                    RankProfile.area == "annandale",
                )
            )
        ).scalar_one()
        title_before = (
            await db.execute(
                select(HonorTitle).where(
                    HonorTitle.sport == "tennis",
                    HonorTitle.area == "annandale",
                )
            )
        ).scalar_one()
        history_count_before = int((await db.execute(select(func.count(HonorHistory.id)))).scalar_one())
        winner_rating_before = winner_before.rating
        winner_wins_before = winner_before.wins
        winner_losses_before = winner_before.losses
        winner_streak_before = winner_before.streak
        loser_rating_before = loser_before.rating
        loser_wins_before = loser_before.wins
        loser_losses_before = loser_before.losses
        loser_streak_before = loser_before.streak
        title_holder_before = title_before.current_holder_user_id

    # Unrelated authed user attempts to flip the title to themselves /
    # to anyone else through the removed POST. The route is gone, so
    # FastAPI returns 404 (Not Found) or 405 (Method Not Allowed).
    attempt = await client.post(
        "/honors/result",
        json={
            "winner_user_id": uid_winner,
            "loser_user_id": uid_loser,
            "sport": "tennis",
            "area": "annandale",
        },
        headers=_auth(unrelated_token),
    )
    assert attempt.status_code in (404, 405), attempt.text

    # Re-read state and assert NOTHING moved.
    async with _TestSession() as db:
        winner_after = (
            await db.execute(
                select(RankProfile).where(
                    RankProfile.user_id == UUID(uid_winner),
                    RankProfile.sport == "tennis",
                    RankProfile.area == "annandale",
                )
            )
        ).scalar_one()
        loser_after = (
            await db.execute(
                select(RankProfile).where(
                    RankProfile.user_id == UUID(uid_loser),
                    RankProfile.sport == "tennis",
                    RankProfile.area == "annandale",
                )
            )
        ).scalar_one()
        title_after = (
            await db.execute(
                select(HonorTitle).where(
                    HonorTitle.sport == "tennis",
                    HonorTitle.area == "annandale",
                )
            )
        ).scalar_one()
        history_count_after = int((await db.execute(select(func.count(HonorHistory.id)))).scalar_one())

    assert winner_after.rating == winner_rating_before
    assert winner_after.wins == winner_wins_before
    assert winner_after.losses == winner_losses_before
    assert winner_after.streak == winner_streak_before
    assert loser_after.rating == loser_rating_before
    assert loser_after.wins == loser_wins_before
    assert loser_after.losses == loser_losses_before
    assert loser_after.streak == loser_streak_before
    assert title_after.current_holder_user_id == title_holder_before
    assert history_count_after == history_count_before


# ---------------------------------------------------------------------------
# Area normalisation — mobile sends lower-case suburb keys, legacy / seed
# rows are Title Case. Writes normalise, reads compare case-insensitively.
# ---------------------------------------------------------------------------


def test_normalize_area_trims_collapses_and_lowercases() -> None:
    from app.services.honor_system import normalize_area

    assert normalize_area("  Surry   Hills ") == "surry hills"
    assert normalize_area("surry hills") == "surry hills"
    assert normalize_area("NEWTOWN") == "newtown"


async def test_legacy_title_case_rows_match_lowercase_area_queries(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token, uid = await _register(client, "hs_area_legacy@example.com")
    _, uid_other = await _register(client, "hs_area_legacy_other@example.com")

    # Seed rows exactly as a v1.0 client / the seed script wrote them.
    async with _TestSession() as db:
        db.add(RankProfile(user_id=UUID(uid), sport="running", area="Surry Hills", rating=1234))
        db.add(
            HonorTitle(
                sport="running",
                area="Surry Hills",
                title_name="Surry Hills Running Champion",
                current_holder_user_id=UUID(uid),
                active=True,
            )
        )
        await db.commit()

    for area in ("surry hills", "Surry Hills", "  SURRY   hills "):
        me = await client.get("/rankings/me", params={"sport": "running", "area": area}, headers=_auth(token))
        assert me.status_code == 200, me.text
        assert me.json()["rating"] == 1234
        assert me.json()["id"] is not None

        board = await client.get("/rankings", params={"sport": "running", "area": area}, headers=_auth(token))
        assert board.status_code == 200, board.text
        assert [row["user_id"] for row in board.json()["items"]] == [uid]

        honor = await client.get("/honors", params={"sport": "running", "area": area}, headers=_auth(token))
        assert honor.status_code == 200, honor.text
        assert honor.json() is not None
        assert honor.json()["current_holder_user_id"] == uid

    # A result recorded with the lower-case key updates the legacy rows
    # instead of creating case-variant duplicates.
    await _record_result(winner_user_id=uid_other, loser_user_id=uid, sport="running", area="surry hills")
    async with _TestSession() as db:
        profiles = list((await db.execute(select(RankProfile).where(RankProfile.user_id == UUID(uid)))).scalars().all())
        titles = list((await db.execute(select(HonorTitle).where(HonorTitle.sport == "running"))).scalars().all())
        other = (await db.execute(select(RankProfile).where(RankProfile.user_id == UUID(uid_other)))).scalar_one()
    assert len(profiles) == 1
    assert profiles[0].area == "Surry Hills"
    assert profiles[0].losses == 1
    assert len(titles) == 1
    assert titles[0].current_holder_user_id == UUID(uid_other)
    # New rows are stored under the normalised key.
    assert other.area == "surry hills"


async def test_new_rows_are_written_with_normalised_area(client: AsyncClient) -> None:
    await _wipe_state()
    _, uid_a = await _register(client, "hs_area_new_a@example.com")
    _, uid_b = await _register(client, "hs_area_new_b@example.com")

    await _record_result(winner_user_id=uid_a, loser_user_id=uid_b, sport="tennis", area="  Bondi   Beach ")
    await _record_result(winner_user_id=uid_b, loser_user_id=uid_a, sport="tennis", area="bondi beach")

    async with _TestSession() as db:
        areas = {r.area for r in (await db.execute(select(RankProfile))).scalars().all()}
        titles = list((await db.execute(select(HonorTitle))).scalars().all())
    assert areas == {"bondi beach"}
    assert len(titles) == 1
    assert titles[0].area == "bondi beach"
    assert titles[0].title_name == "Bondi Beach Tennis Champion"
    assert titles[0].current_holder_user_id == UUID(uid_b)
