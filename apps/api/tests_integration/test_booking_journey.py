"""Exercise the migrated schema and normal dependencies on disposable PG/Redis."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from app.main import app


async def test_booking_journey() -> None:
    # Run separately from the SQLite unit suite, after `alembic upgrade head`.
    # No dependency overrides: this must use PostgreSQL and Redis from the env.
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            health = await client.get("/health")
            assert health.status_code == 200, health.text
            assert health.json()["checks"] == {"db": "ok", "redis": "ok"}

            async def register() -> tuple[dict[str, str], str]:
                response = await client.post(
                    "/auth/register",
                    json={"email": f"integration-{uuid4().hex}@example.com", "password": "integration-password-123"},
                )
                assert response.status_code == 201, response.text
                headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
                me = await client.get("/auth/me", headers=headers)
                assert me.status_code == 200, me.text
                return headers, me.json()["id"]

            proposer, proposer_id = await register()
            partner, partner_id = await register()
            outsider, _ = await register()

            for headers, target in ((proposer, partner_id), (partner, proposer_id)):
                match = await client.post(
                    "/discovery/actions",
                    json={"target_user_id": target, "action": "like", "sport": "gym"},
                    headers=headers,
                )
                assert match.status_code == 200, match.text
            match_id = match.json()["match_id"]
            assert match_id

            start = datetime.now(timezone.utc) + timedelta(days=7)
            created = await client.post(
                "/bookings",
                json={
                    "match_id": match_id,
                    "sport": "gym",
                    "starts_at": start.isoformat(),
                    "ends_at": (start + timedelta(hours=1)).isoformat(),
                    "location": "Integration test venue",
                },
                headers=proposer,
            )
            assert created.status_code == 201, created.text
            assert created.json()["status"] == "proposed"
            booking_url = f"/bookings/{created.json()['id']}"

            hidden = await client.get(booking_url, headers=outsider)
            assert hidden.status_code == 404, hidden.text
            self_confirm = await client.post(f"{booking_url}/confirm", headers=proposer)
            assert self_confirm.status_code == 403, self_confirm.text

            confirmed = await client.post(f"{booking_url}/confirm", headers=partner)
            assert confirmed.status_code == 200, confirmed.text
            assert confirmed.json()["status"] == "confirmed"
            for headers in (proposer, partner):
                persisted = await client.get(booking_url, headers=headers)
                assert persisted.status_code == 200, persisted.text
                assert persisted.json()["status"] == "confirmed"
