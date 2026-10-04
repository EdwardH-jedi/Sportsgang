"""Separate notification process for the integration tests (not a test module).

Runs `process_pending_notifications` in its own process and database pool,
like `worker.py`, with one barrier for one recipient, then reports each
provider invocation on stdout (`OTHER_INVOCATION` for other bookings). A recording provider stands in for Expo; no
network call is made.

    python tests_integration/notification_worker_barrier.py <mode> <recipient_id> <booking_id> [event_id]

`before-dispatch` pauses before event `event_id` is claimed (and prints
`OUTCOME <outcome>` for it); `before-lock` pauses before the recipient's
proposal takes its pair lock; `after-lock` pauses at the recipient's token
lookup, which runs under the lock. The process prints `BARRIER` when paused
and continues after a line on stdin.
"""

from __future__ import annotations

import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from unittest.mock import patch  # noqa: E402

from app.db.session import AsyncSessionLocal, engine  # noqa: E402
from app.services import notifications, safety  # noqa: E402


async def _pause() -> None:
    print("BARRIER", flush=True)
    await asyncio.to_thread(sys.stdin.readline)


async def main(mode: str, recipient_id: str, booking_id: str, event_id: str = "") -> None:
    original_dispatch = notifications._dispatch
    original_lock = safety.lock_contact
    original_token = notifications._get_latest_push_token

    async def dispatch(db, event, now):
        if mode != "before-dispatch" or str(getattr(event, "id", event)) != event_id:
            return await original_dispatch(db, event, now)
        await _pause()
        outcome = await original_dispatch(db, event, now)
        print(f"OUTCOME {outcome}", flush=True)
        return outcome

    async def lock(db, a, b):
        if mode == "before-lock" and recipient_id in {str(a), str(b)}:
            await _pause()
        return await original_lock(db, a, b)

    async def token(db, user_id):
        if mode == "after-lock" and str(user_id) == recipient_id:
            await _pause()
        return await original_token(db, user_id)

    async def provider(token_value, title, body, data):
        if data["bookingId"] == booking_id:
            print(f"PROVIDER_INVOCATION {data['type']}", flush=True)
        else:
            print(f"OTHER_INVOCATION {data['type']} {data['bookingId']}", flush=True)
        return True

    with (
        patch.object(notifications, "_dispatch", dispatch),
        patch.object(safety, "lock_contact", lock),
        patch.object(notifications, "_get_latest_push_token", token),
        patch.object(notifications, "_send_expo_push", provider),
    ):
        async with AsyncSessionLocal() as db:
            result = await notifications.process_pending_notifications(db)
    print(f"RESULT processed={result.processed} failed={result.failed}", flush=True)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:5]))
