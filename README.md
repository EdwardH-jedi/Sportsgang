# SportsGang

SportsGang helps people in Sydney find partners for gym, golf, tennis, and running, then arrange a session through matching, chat, and participant-confirmed bookings. The main product is an Expo/React Native app backed by FastAPI, PostgreSQL, and Redis, and v1.0 is on the [App Store](https://apps.apple.com/us/app/sportsgang/id6767027447).

## Engineering highlights

- **Async FastAPI backend:** Python 3.12, FastAPI, Pydantic 2, and async SQLAlchemy 2 over asyncpg, with JWT auth, WebSocket chat delivery, and a separate notification worker.
- **Booking state machine:** the session lifecycle (propose → confirm/decline → cancel/complete/no-show) is one declarative transition table in [`apps/api/app/services/bookings.py`](apps/api/app/services/bookings.py), so every state change and its side effects are validated in one place.
- **Alembic migrations:** schema changes ship as a linear chain of versioned migrations in [`apps/api/alembic/versions/`](apps/api/alembic/versions/).
- **PostgreSQL + Redis integration CI:** alongside the fast SQLite unit suite, [GitHub Actions](https://github.com/EdwardH-jedi/Sportsgang/actions/workflows/ci.yml) starts real PostgreSQL 16 and Redis 7 services, migrates a fresh database, and runs the booking journey in [`apps/api/tests_integration/`](apps/api/tests_integration/).
- **Expo / React Native app:** Expo 54, React Native 0.81, React 19, and TypeScript, with request/response contracts shared through the `@protin/shared-types` workspace package.
- **App Store release, May 2026:** SportsGang v1.0 was approved for App Store distribution on 13 May 2026 after one documented App Review cycle ([release history](docs/PORTFOLIO_FACTS.md)).

## Quick start

Three commands from a fresh clone, using the local development defaults (requires Node.js 20, Python 3.12, uv, and Docker with Compose):

```bash
cp .env.example .env && npm ci && npm run infra:up -- --wait
cd apps/api && uv sync --frozen --dev && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
npm run mobile:start   # in a second terminal, from the repository root
```

The API serves on `http://127.0.0.1:8000` (docs at `/docs`), and the iOS simulator reaches it on `localhost`. For per-service configuration, a generated signing key, Android/physical-device URLs, and troubleshooting, follow [Local setup](#local-setup).

## Implemented features

- **Discovery and matching:** sport-scoped partner feeds, compatibility scoring, and mutual likes that create a match
- **Chat and sessions:** match-specific message threads with WebSocket delivery; propose, confirm, decline, cancel, complete, or mark a session as a no-show
- **Challenges and reputation:** one-to-one challenges, recorded results, rank progression, and honour/reputation events
- **Venue discovery:** a local venue catalog with optional Google Places results and deduplication
- **Group events:** host or join sports events and confirm attendance
- **Accounts and safety:** email/password and Sign in with Apple paths, profile photos, reporting, blocking, and moderation
- **Optional integrations:** Google Calendar sync and Expo push notifications

Recorded iOS release screens:

<p>
  <img src="docs/release/screenshots/ios/01-discovery-gym-partners.png" width="230" alt="SportsGang partner discovery screen">
  <img src="docs/release/screenshots/ios/03-chat-confirmed-session.png" width="230" alt="Chat showing a confirmed sports session">
  <img src="docs/release/screenshots/ios/05-propose-session-form.png" width="230" alt="Form for proposing a sports session">
</p>

## Release status

SportsGang v1.0 received App Store approval on 13 May 2026, as recorded in the [release history](docs/PORTFOLIO_FACTS.md).

## Stack and architecture

| Area | Implementation |
| --- | --- |
| Mobile | Expo 54, React Native 0.81, React 19, TypeScript, React Navigation, Zustand |
| API | Python 3.12, FastAPI, Pydantic 2, async SQLAlchemy 2, asyncpg, Alembic |
| Data | PostgreSQL 16 and Redis 7 |
| Shared contracts | `@protin/shared-types` TypeScript package |
| Tooling and deployment | npm workspaces, uv, Docker Compose, nginx, Fly.io configuration, GitHub Actions |

The mobile app uses an HTTP/JWT API and match-specific WebSockets. The API stores application data in PostgreSQL and uses Redis; a separate worker processes notification delivery. Alembic manages schema changes.

**SportsGang is the public product name.** `Protin`, `protin-api`, and `@protin/*` remain internal project, package, and infrastructure names.

## Local setup

For authorized local evaluation and development under the [proprietary license](LICENSE).

**Prerequisites:** Git, Node.js 20, npm 10+, Python 3.12, uv, and Docker with Compose. An iOS simulator requires macOS/Xcode; use an Android emulator or a configured development device otherwise. The commands below use Bash.

### 1. Install dependencies and configure local files

```bash
git clone https://github.com/EdwardH-jedi/Sportsgang.git
cd Sportsgang
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
npm ci
cd apps/api
uv sync --frozen --dev
uv run python -c "import secrets; print(secrets.token_hex(32))"
cd ../..
```

Put the generated value in `SECRET_KEY` in `apps/api/.env`, replacing the example value. Keep `APP_ENV=local`. Never commit `.env` files or reuse example credentials for deployment.

Configuration is split across three files:

| File | Purpose |
| --- | --- |
| [`.env.example`](.env.example) → `.env` | Docker Compose database credentials and published ports |
| [`apps/api/.env.example`](apps/api/.env.example) → `apps/api/.env` | API runtime settings; `POSTGRES_URL` and `REDIS_URL` must match Compose |
| [`apps/mobile/.env.example`](apps/mobile/.env.example) → `apps/mobile/.env` | Mobile API URL and public app configuration |

For a basic local review, leave Google credentials and the Places key empty. Use test accounts and avoid connecting real OAuth accounts without configuring token encryption. `EXPO_PUBLIC_*` values are embedded in the mobile bundle: never put backend secrets or the server-side Google Places key there.

### 2. Start PostgreSQL and Redis

From the repository root:

```bash
npm run infra:up
npm run infra:ps
```

Wait until both services are healthy. Defaults publish PostgreSQL on port 5432 and Redis on 6379. These are development services with example database credentials; use a trusted local machine and do not expose them to the internet.

### 3. Migrate and run the API

```bash
cd apps/api
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
curl http://127.0.0.1:8000/health
```

A healthy response has `status: "ok"` and both `checks.db` and `checks.redis` set to `"ok"`. A dependency failure returns HTTP 503 with `status: "degraded"`. API documentation is at [localhost:8000/docs](http://localhost:8000/docs).

### 4. Run the mobile app

From a separate terminal at the repository root:

```bash
npm run mobile:start
```

Use `i` for the iOS simulator or `a` for an Android emulator. Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to an address that the device can reach:

- iOS simulator on the API host: `http://localhost:8000`
- Android Studio emulator: `http://10.0.2.2:8000`
- Physical device: `http://<your-computer-LAN-IP>:8000` on the same trusted network; restart the API with `--host 0.0.0.0` and permit only the required local-network access

Restart Expo after changing its environment. Native integrations need appropriate device/build configuration; push delivery requires a physical-device check. Create at least two test accounts with profiles to exercise discovery, mutual matching, and session proposals.

## Tests and verification

From the repository root:

```bash
npm run lint --workspace @protin/mobile
npm run typecheck --workspace @protin/mobile
npm run test:ci --workspace @protin/mobile
```

From `apps/api`:

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

The API unit suite uses SQLite and service mocks. Mobile checks cover ESLint, TypeScript, and Jest component/unit behavior. CI also builds the API Docker image and runs a separate PostgreSQL/Redis journey covering fresh migrations, registration, matching, booking permissions, and confirmation.

To reproduce the integration job, point `POSTGRES_URL` and `REDIS_URL` at **disposable local services**, set `APP_ENV=local` and a development `SECRET_KEY`, then run from `apps/api`:

```bash
uv run alembic upgrade head
uv run pytest tests_integration -q
```

The integration test writes accounts and bookings. Never point it at production. See [verification scope](docs/VERIFICATION.md) and the [workflow](.github/workflows/ci.yml) for the exact checks.

## Operational notes

- Photos currently use local filesystem storage. Deployment needs a deliberate persistence and backup plan.
- Staging/production startup requires a non-default signing key, `FIELD_ENCRYPTION_KEY`, and `INTERNAL_API_TOKEN`. Local mode permits plaintext OAuth token fallback when no encryption key is configured. Review [environment configuration](docs/staging/ENV_VARS.md), [security notes](docs/security/SECURITY_AUDIT.md), and the [release runbook](docs/deployment/RELEASE_RUNBOOK.md) before deploying.

### Stop, troubleshoot, or reset

```bash
npm run infra:logs   # inspect PostgreSQL/Redis logs
npm run infra:down   # stop services; preserve data volumes
```

For port conflicts, change `POSTGRES_PORT`/`REDIS_PORT` in the root `.env`, update the matching API connection URLs, then run `npm run infra:down` followed by `npm run infra:up`. A port change does not require deleting data. If migrations cannot connect, wait for healthy services and check credentials/URLs before retrying.

**Destructive reset:** `npm run infra:reset` deletes the database and Redis volumes. Use it only for disposable data, then rerun `uv run alembic upgrade head` from `apps/api`.

## Repository map and further reading

| Path | Contents |
| --- | --- |
| [`apps/api/`](apps/api/) | API, domain services, Alembic migrations, unit and integration tests |
| [`apps/mobile/`](apps/mobile/) | Mobile screens, navigation, API client, state, and theme |
| [`packages/shared-types/`](packages/shared-types/) | Shared TypeScript contracts |
| [`infra/`](infra/) | nginx and deployment, backup, and health-check scripts |
| [`docs/`](docs/) | Release, security, staging, workflow, and contract documentation |

Start with [Portfolio Facts](docs/PORTFOLIO_FACTS.md) for release history, [Verification](docs/VERIFICATION.md) for test boundaries, [Staging Setup](docs/staging/SETUP.md) and [Runbook](docs/staging/RUNBOOK.md) for operator instructions, and the [Venue Runbook](docs/runbooks/venues.md) for provider setup.

## License

Copyright © 2026 Edward Hwang. All rights reserved. The source is publicly visible for portfolio and evaluation purposes under the existing [proprietary license](LICENSE). Public visibility does not make it open source; use, modification, and redistribution require the copyright holder's prior written permission.

## Limitations

This section covers what the App Store listing, the recorded screenshots, and the checks in this repository do not establish.

- The App Store listing and recorded screenshots are release evidence; they do not guarantee current backend availability. No always-on public backend demo is provided.
- This repository does not establish download or active-user metrics.
- A green CI run does not verify external Apple/Google/Expo services, production load, or every concurrency/recovery scenario.
- Apple, Google, and Expo integrations sit outside the local test boundary.
- Bookings coordinate sessions between participants. They do not reserve a facility's inventory or process a court payment.
- Tournament endpoints were removed in [#6](https://github.com/EdwardH-jedi/Sportsgang/pull/6) rather than left unfinished; the app has no tournament feature.
- A dropped chat WebSocket is not reconnected; live messages stop until the chat is reopened.
- If a profile-photo replace fails at the database commit with an unknown outcome, one set of photo files is left on disk, unreferenced. Nothing reconciles them later.
- Chat history keeps the reader's place when earlier messages load. That is verified in component tests (React Native Testing Library) only, not on a device.
- Optional integrations (Google Calendar, Expo push, Google Places) need provider configuration and separate delivery verification.
- Older staging notes are historical records, not a current availability report.
