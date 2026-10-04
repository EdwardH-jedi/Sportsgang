"""Separate notification process for test_contact_authority.py (not a test module).

Runs `process_pending_notifications` in its own process and database pool,
like `worker.py`, with one barrier for one recipient, then reports each
provider invocation on stdout. A recording provider stands in for Expo; no
network call is made.

    python tests_integration/notification_worker_barrier.py <before-lock|after-lock> <recipient_id> <booking_id>

`before-lock` pauses before the proposal's pair lock is taken; `after-lock`
pauses at the token lookup, which runs under the lock. The process prints
`BARRIER` when paused and continues after a line on stdin.
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


async def main(mode: str, recipient_id: str, booking_id: str) -> None:
    original_lock = safety.lock_contact
    original_token = notifications._get_latest_push_token

    async def lock(db, a, b):
        if mode == "before-lock":
            await _pause()
        return await original_lock(db, a, b)

    async def token(db, user_id):
        if mode == "after-lock" and str(user_id) == recipient_id:
            await _pause()
        return await original_token(db, user_id)

    async def provider(token_value, title, body, data):
        if data["bookingId"] == booking_id:
            print(f"PROVIDER_INVOCATION {data['type']}", flush=True)
        return True

    with (
        patch.object(safety, "lock_contact", lock),
        patch.object(notifications, "_get_latest_push_token", token),
        patch.object(notifications, "_send_expo_push", provider),
    ):
        async with AsyncSessionLocal() as db:
            result = await notifications.process_pending_notifications(db)
    print(f"RESULT processed={result.processed} failed={result.failed}", flush=True)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:4]))
