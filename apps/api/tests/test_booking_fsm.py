"""Pure unit tests for the booking state machine — no database, no HTTP.

test_bookings.py exercises the FSM through the API. These tests call
app/services/bookings.py::_check_transition directly so the full
(from_status, to_status) matrix is pinned down, and drive
transition_booking with mocked I/O to show that a repeated confirm has no
side effects.

Documented behaviour (see _TRANSITIONS and the FSM comment in
test_bookings.py):
  proposed   -> confirmed (partner) | declined (partner) | cancelled (proposer)
  confirmed  -> cancelled | completed | no_show (either participant)
Any other (from, to) pair is rejected with 422
"Cannot transition from '<from>' to '<to>'"; an allowed transition attempted
by the wrong participant is rejected with 403.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

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

PROPOSER_ID = uuid4()
PARTNER_ID = uuid4()
ACTORS = {"proposer": PROPOSER_ID, "partner": PARTNER_ID}


def _booking(status: str) -> Booking:
    return Booking(
        id=uuid4(),
        proposer_id=PROPOSER_ID,
        partner_id=PARTNER_ID,
        sport="tennis",
        status=status,
    )


def _assert_rejected(booking: Booking, new_status: str, actor: str, code: int, detail: str) -> None:
    before = booking.status
    with pytest.raises(HTTPException) as exc:
        bookings_service._check_transition(booking, new_status, ACTORS[actor])
    assert exc.value.status_code == code
    assert exc.value.detail == detail
    assert booking.status == before


# ---------------------------------------------------------------------------
# Every invalid transition → 422 with the documented message, for either actor
# ---------------------------------------------------------------------------


def test_invalid_matrix_is_the_complement_of_the_documented_table() -> None:
    assert len(INVALID) == len(STATUSES) ** 2 - len(ALLOWED) == 30


@pytest.mark.parametrize("actor", ["proposer", "partner"])
@pytest.mark.parametrize(("src", "dst"), INVALID, ids=[f"{s}->{d}" for s, d in INVALID])
def test_invalid_transition_raises_422(src: str, dst: str, actor: str) -> None:
    _assert_rejected(_booking(src), dst, actor, 422, f"Cannot transition from '{src}' to '{dst}'")


# ---------------------------------------------------------------------------
# no_show and cancel from every state, by each participant
# ---------------------------------------------------------------------------

# Expected outcome per (from_status, actor): None = allowed, else (status_code, detail).
_PROPOSER_ONLY = (403, "Only the proposer can perform this transition")


def _not_allowed(src: str, dst: str) -> tuple[int, str]:
    return (422, f"Cannot transition from '{src}' to '{dst}'")


NO_SHOW_CASES = [
    (src, actor, None if src == "confirmed" else _not_allowed(src, "no_show"))
    for src in STATUSES
    for actor in ("proposer", "partner")
]

CANCEL_CASES = [
    (
        src,
        actor,
        None
        if src == "confirmed" or (src == "proposed" and actor == "proposer")
        else _PROPOSER_ONLY
        if src == "proposed"
        else _not_allowed(src, "cancelled"),
    )
    for src in STATUSES
    for actor in ("proposer", "partner")
]


@pytest.mark.parametrize(("src", "actor", "expected"), NO_SHOW_CASES, ids=[f"{s}-{a}" for s, a, _ in NO_SHOW_CASES])
def test_no_show_from_each_state(src: str, actor: str, expected: tuple[int, str] | None) -> None:
    booking = _booking(src)
    if expected is None:
        bookings_service._check_transition(booking, "no_show", ACTORS[actor])
    else:
        _assert_rejected(booking, "no_show", actor, *expected)


@pytest.mark.parametrize(("src", "actor", "expected"), CANCEL_CASES, ids=[f"{s}-{a}" for s, a, _ in CANCEL_CASES])
def test_cancel_from_each_state(src: str, actor: str, expected: tuple[int, str] | None) -> None:
    booking = _booking(src)
    if expected is None:
        bookings_service._check_transition(booking, "cancelled", ACTORS[actor])
    else:
        _assert_rejected(booking, "cancelled", actor, *expected)


# ---------------------------------------------------------------------------
# Double confirm: the second confirm is rejected and changes nothing
# ---------------------------------------------------------------------------


def test_double_confirm_is_rejected_by_the_fsm() -> None:
    booking = _booking("proposed")
    bookings_service._check_transition(booking, "confirmed", PARTNER_ID)
    booking.status = "confirmed"

    _assert_rejected(booking, "confirmed", "partner", 422, "Cannot transition from 'confirmed' to 'confirmed'")


async def test_double_confirm_has_no_repeated_side_effects(monkeypatch: pytest.MonkeyPatch) -> None:
    booking = _booking("proposed")
    db = AsyncMock()
    record_transition = AsyncMock()
    schedule_notification = AsyncMock()
    response = object()

    monkeypatch.setattr(bookings_service, "_get_booking_or_404", AsyncMock(return_value=booking))
    monkeypatch.setattr(
        bookings_service, "_build_partner_card", AsyncMock(return_value=SimpleNamespace(display_name="Sam"))
    )
    monkeypatch.setattr(bookings_service, "_to_response", AsyncMock(return_value=response))
    monkeypatch.setattr(bookings_service.rank_service, "record_booking_transition", record_transition)
    monkeypatch.setattr(bookings_service.notif_service, "schedule_booking_notification", schedule_notification)

    first = await bookings_service.transition_booking(db, booking.id, "confirmed", PARTNER_ID)

    assert first is response
    assert booking.status == "confirmed"
    assert record_transition.await_count == 1
    # booking_confirmed to the proposer + a reminder for each participant.
    assert schedule_notification.await_count == 3
    assert db.commit.await_count == 1

    with pytest.raises(HTTPException) as exc:
        await bookings_service.transition_booking(db, booking.id, "confirmed", PARTNER_ID)

    assert exc.value.status_code == 422
    assert exc.value.detail == "Cannot transition from 'confirmed' to 'confirmed'"
    assert booking.status == "confirmed"
    assert record_transition.await_count == 1
    assert schedule_notification.await_count == 3
    assert db.commit.await_count == 1
