"""Show the documented cooperative-cancellation limit without real network traffic."""
import asyncio
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[5]
os.environ.update(json.loads(Path('/private/tmp/sg_review_env_20261005.json').read_text()))
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.services import chat

async def main():
    entered, cancelled, release = asyncio.Event(), asyncio.Event(), asyncio.Event()
    class Socket:
        async def send_json(self, data):
            entered.set()
            try:
                await release.wait()
            except asyncio.CancelledError:
                cancelled.set()
                await release.wait()
        async def close(self, code):
            pass
    manager = chat.ConnectionManager()
    await manager.connect('review', Socket())
    chat.WS_SEND_TIMEOUT_SECONDS = .02
    job = asyncio.create_task(manager.broadcast('review', {}))
    try:
        await asyncio.wait_for(entered.wait(), 1)
        await asyncio.wait_for(cancelled.wait(), 1)
        await asyncio.sleep(.1)
        result = {'configured_deadline_seconds': .02,
                  'still_waiting_after_send_ignored_cancellation': not job.done(),
                  'extra_wait_seconds': .1,
                  'real_network_or_provider_used': False}
    finally:
        release.set()
        await asyncio.wait_for(job, 1)
        if manager._closing:
            await asyncio.wait(manager._closing)
    result['completed_after_cooperative_release'] = job.done()
    (ROOT / 'docs/run-golf-v2/independent-review-2026-10-05/evidence/authority-extra/deadline-assumption.json').write_text(json.dumps(result, indent=2) + '\n')
    assert result['still_waiting_after_send_ignored_cancellation']
    print(json.dumps(result))

asyncio.run(main())
