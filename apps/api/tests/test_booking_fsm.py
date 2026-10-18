"""Pure unit tests for the booking state machine — no database, no HTTP.

test_bookings.py exercises the FSM through the API. These tests drive the
public service function, app/services/bookings.py::transition_booking, for
every (from_status, to_status, participant) combination. The session is an
AsyncMock and the response, rank and notification helpers are monkeypatched,
so each test checks what a caller observes: the status code, the booking's
resulting status, how many side effects ran, and who each notification goes to.

Documented behaviour (see _TRANSITIONS and the FSM comment in
test_bookings.py):
  proposed   -> confirmed (partner) | declined (partner) | cancelled (proposer)
  confirmed  -> cancelled | completed | no_show (either participant)
Any other (from, to) pair is rejected with 422; an allowed transition
attempted by the wrong participant is rejected with 403; any transition
attempted by someone who is not a participant is rejected with 404. A rejected
transition leaves the booking unchanged and runs no side effects.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.models.booking import Booking
from app.services import bookings as bookings_service

STATUSES = ("proposed", "confirmed", "declined", "cancelled", "completed", "no_show")

# Documented allowed transitions → which participant may perform them.
ALLOWED: dict[tuple[str, str], str] = {
    ("proposed", "confirmed"): "partner",
    ("proposed", "declined"): "partner",
    ("proposed", "cancelled"): "proposer",
    ("confirmed", "cancelled"): "either",
    ("confirmed", "completed"): "either",
    ("confirmed", "no_show"): "either",
}

INVALID = [(src, dst) for src in STATUSES for dst in STATUSES if (src, dst) not in ALLOWED]

# Notifications a successful transition schedules: the other participant hears
# about confirm/decline/cancel, and a confirm adds a reminder for each participant.
NOTIFICATIONS = {"confirmed": 3, "declined": 1, "cancelled": 1, "completed": 0, "no_show": 0}

# (rank transitions recorded, notifications scheduled, commits)
NO_SIDE_EFFECTS = (0, 0, 0)

PROPOSER_ID = uuid4()
PARTNER_ID = uuid4()
OUTSIDER_ID = uuid4()
ACTORS = {"proposer": PROPOSER_ID, "partner": PARTNER_ID, "outsider": OUTSIDER_ID}
# Distinct display names so a notification naming the wrong person is visible.
NAMES = {PROPOSER_ID: "Pat", PARTNER_ID: "Quinn", OUTSIDER_ID: "Olly"}


def _booking(status: str, *, partner_id: UUID = PARTNER_ID) -> Booking:
    return Booking(
        id=uuid4(),
        proposer_id=PROPOSER_ID,
        partner_id=partner_id,
        sport="tennis",
        status=status,
    )


@pytest.fixture
def service(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """transition_booking with its I/O replaced; the FSM itself runs for real."""
    svc = SimpleNamespace(
        db=AsyncMock(),
        loaded=MagicMock(),
        record_transition=AsyncMock(),
        schedule_notification=AsyncMock(),
    )
    # The booking lookup is the only query left once the helpers below are mocked.
    svc.db.execute.return_value = svc.loaded
    monkeypatch.setattr(
        bookings_service,
        "_build_partner_card",
        AsyncMock(side_effect=lambda _db, user_id, _sport: SimpleNamespace(display_name=NAMES[user_id])),
    )
    monkeypatch.setattr(bookings_service, "_to_response", AsyncMock(return_value=SimpleNamespace()))
    monkeypatch.setattr(bookings_service.rank_service, "record_booking_transition", svc.record_transition)
    monkeypatch.setattr(bookings_service.notif_service, "schedule_booking_notification", svc.schedule_notification)
    return svc


async def _transition(service: SimpleNamespace, booking: Booking | None, new_status: str, actor: str) -> int:
    """Call transition_booking; return 200 on success, else the rejection's status code."""
    service.loaded.scalar_one_or_none.return_value = booking
    booking_id = booking.id if booking is not None else uuid4()
    try:
        await bookings_service.transition_booking(service.db, booking_id, new_status, ACTORS[actor])
    except HTTPException as exc:
        return exc.status_code
    return 200


def _side_effects(service: SimpleNamespace) -> tuple[int, int, int]:
    return (
        service.record_transition.await_count,
        service.schedule_notification.await_count,
        service.db.commit.await_count,
    )


async def _assert_applied(service: SimpleNamespace, src: str, dst: str, actor: str) -> None:
    booking = _booking(src)
    assert await _transition(service, booking, dst, actor) == 200
    assert booking.status == dst
    assert _side_effects(service) == (1, NOTIFICATIONS[dst], 1)


async def _assert_rejected(service: SimpleNamespace, src: str, dst: str, actor: str, code: int) -> None:
    booking = _booking(src)
    assert await _transition(service, booking, dst, actor) == code
    assert booking.status == src
    assert _side_effects(service) == NO_SIDE_EFFECTS


# ---------------------------------------------------------------------------
# Every invalid transition → 422 for either participant, nothing changes
# ---------------------------------------------------------------------------


def test_invalid_matrix_is_the_complement_of_the_documented_table() -> None:
    assert len(INVALID) == len(STATUSES) ** 2 - len(ALLOWED) == 30


@pytest.mark.parametrize("actor", ["proposer", "partner"])
@pytest.mark.parametrize(("src", "dst"), INVALID, ids=[f"{s}->{d}" for s, d in INVALID])
async def test_invalid_transition_is_rejected_with_422(
    service: SimpleNamespace, src: str, dst: str, actor: str
) -> None:
    await _assert_rejected(service, src, dst, actor, 422)


# ---------------------------------------------------------------------------
# Every documented transition, by each participant
# ---------------------------------------------------------------------------

# (from, to, actor, permitted): the permitted participant moves the booking;
# the other participant is rejected with 403.
DOCUMENTED_CASES = [
    (src, dst, actor, allowed_by in ("either", actor))
    for (src, dst), allowed_by in ALLOWED.items()
    for actor in ("proposer", "partner")
]


@pytest.mark.parametrize(
    ("src", "dst", "actor", "permitted"),
    DOCUMENTED_CASES,
    ids=[f"{s}->{d}-{a}" for s, d, a, _ in DOCUMENTED_CASES],
)
async def test_documented_transition_by_each_participant(
    service: SimpleNamespace, src: str, dst: str, actor: str, permitted: bool
) -> None:
    if permitted:
        await _assert_applied(service, src, dst, actor)
    else:
        await _assert_rejected(service, src, dst, actor, 403)


# ---------------------------------------------------------------------------
# no_show and cancel from every state, by each participant
# ---------------------------------------------------------------------------

# Expected outcome per (from_status, actor): None = applied, else the status code.
NO_SHOW_CASES = [
    (src, actor, None if src == "confirmed" else 422) for src in STATUSES for actor in ("proposer", "partner")
]

CANCEL_CASES = [
    (
        src,
        actor,
        None
        if src == "confirmed" or (src == "proposed" and actor == "proposer")
        else 403
        if src == "proposed"
        else 422,
    )
    for src in STATUSES
    for actor in ("proposer", "partner")
]


@pytest.mark.parametrize(("src", "actor", "expected"), NO_SHOW_CASES, ids=[f"{s}-{a}" for s, a, _ in NO_SHOW_CASES])
async def test_no_show_from_each_state(service: SimpleNamespace, src: str, actor: str, expected: int | None) -> None:
    if expected is None:
        await _assert_applied(service, src, "no_show", actor)
    else:
        await _assert_rejected(service, src, "no_show", actor, expected)


@pytest.mark.parametrize(("src", "actor", "expected"), CANCEL_CASES, ids=[f"{s}-{a}" for s, a, _ in CANCEL_CASES])
async def test_cancel_from_each_state(service: SimpleNamespace, src: str, actor: str, expected: int | None) -> None:
    if expected is None:
        await _assert_applied(service, src, "cancelled", actor)
    else:
        await _assert_rejected(service, src, "cancelled", actor, expected)


# ---------------------------------------------------------------------------
# Double confirm: the second confirm is rejected and changes nothing
# ---------------------------------------------------------------------------


async def test_double_confirm_has_no_repeated_side_effects(service: SimpleNamespace) -> None:
    booking = _booking("proposed")

    assert await _transition(service, booking, "confirmed", "partner") == 200
    assert booking.status == "confirmed"
    after_first = _side_effects(service)
    assert after_first == (1, NOTIFICATIONS["confirmed"], 1)

    assert await _transition(service, booking, "confirmed", "partner") == 422
    assert booking.status == "confirmed"
    assert _side_effects(service) == after_first


# ---------------------------------------------------------------------------
# Guards before the FSM: missing booking, single-participant booking
# ---------------------------------------------------------------------------


async def test_transition_on_missing_booking_is_404(service: SimpleNamespace) -> None:
    assert await _transition(service, None, "confirmed", "partner") == 404
    assert _side_effects(service) == NO_SIDE_EFFECTS


async def test_booking_without_two_distinct_participants_cannot_transition(service: SimpleNamespace) -> None:
    # proposed -> cancelled by the proposer is otherwise allowed, so this 422 comes from the guard.
    booking = _booking("proposed", partner_id=PROPOSER_ID)
    assert await _transition(service, booking, "cancelled", "proposer") == 422
    assert booking.status == "proposed"
    assert _side_effects(service) == NO_SIDE_EFFECTS


# ---------------------------------------------------------------------------
# Non-participants: every documented transition is a 404, nothing changes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("src", "dst"), list(ALLOWED), ids=[f"{s}->{d}" for s, d in ALLOWED])
async def test_non_participant_cannot_transition(service: SimpleNamespace, src: str, dst: str) -> None:
    # 404 rather than 403 so an outsider cannot tell the booking exists. The
    # confirmed -> * edges are "either"; only the participant check stops them.
    await _assert_rejected(service, src, dst, "outsider", 404)


# ---------------------------------------------------------------------------
# Who hears about a transition, and whose name each notification carries
# ---------------------------------------------------------------------------


def _notifications(service: SimpleNamespace) -> list[tuple[str, UUID, str]]:
    """(type, recipient, display name) for each scheduled notification, in order."""
    return [(call.args[2], call.args[3], call.args[4]) for call in service.schedule_notification.await_args_list]


async def test_confirm_notifies_proposer_and_reminds_each_participant_of_the_other(
    service: SimpleNamespace,
) -> None:
    assert await _transition(service, _booking("proposed"), "confirmed", "partner") == 200
    assert _notifications(service) == [
        ("booking_confirmed", PROPOSER_ID, NAMES[PARTNER_ID]),
        ("reminder", PROPOSER_ID, NAMES[PARTNER_ID]),
        ("reminder", PARTNER_ID, NAMES[PROPOSER_ID]),
    ]


# (from, to, actor) for every applied transition that notifies the other participant.
OTHER_PARTICIPANT_CASES = [
    ("proposed", "declined", "partner"),
    ("proposed", "cancelled", "proposer"),
    ("confirmed", "cancelled", "proposer"),
    ("confirmed", "cancelled", "partner"),
]


@pytest.mark.parametrize(
    ("src", "dst", "actor"),
    OTHER_PARTICIPANT_CASES,
    ids=[f"{s}->{d}-{a}" for s, d, a in OTHER_PARTICIPANT_CASES],
)
async def test_transition_notifies_the_other_participant_by_the_actors_name(
    service: SimpleNamespace, src: str, dst: str, actor: str
) -> None:
    actor_id = ACTORS[actor]
    other_id = PARTNER_ID if actor_id == PROPOSER_ID else PROPOSER_ID
    assert await _transition(service, _booking(src), dst, actor) == 200
    assert _notifications(service) == [(f"booking_{dst}", other_id, NAMES[actor_id])]
