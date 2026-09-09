# Verification scope

The [CI workflow](../.github/workflows/ci.yml) runs on pushes and pull requests.
Its run page is the source for the status of a particular commit.

| Check | What it establishes |
|---|---|
| API unit suite | API contracts and domain behavior using SQLite and service mocks |
| Mobile lint, types, tests | Static checks and Jest component/unit behavior |
| Docker build | API image can be built |
| PostgreSQL / Redis integration | Fresh Alembic migration, real service health, account registration, mutual matching, booking permissions and confirmation |

The integration job uses disposable PostgreSQL 16 and Redis 7 services. It runs
`uv run alembic upgrade head` before `uv run pytest tests_integration -q`.
The test uses the application's normal database and Redis dependencies, without
SQLite overrides or `Base.metadata.create_all`. It asserts the real health check
and reloads the confirmed booking through the API.

To reproduce, use a **disposable local database** and Redis instance, set
`APP_ENV=local`, `POSTGRES_URL`, `REDIS_URL`, and a development `SECRET_KEY`, then
run those commands from `apps/api`. The test creates uniquely named accounts and
a booking; discard the test database afterwards. Do not point it at production.

These checks do not establish live service availability, production load capacity,
App Store availability, or Apple/Google/Expo integration success. Recorded iOS
screenshots and historical release evidence are linked in
[Portfolio Facts](PORTFOLIO_FACTS.md).
