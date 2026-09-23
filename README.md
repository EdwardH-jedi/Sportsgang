# SportsGang

Peer sports matchmaking for iOS — find opponents by sport, challenge them, book nearby courts, and track results through a ranking and honour system.

[![Download on the App Store](https://img.shields.io/badge/App_Store-SportsGang-0D96F6?logo=apple&logoColor=white)](https://apps.apple.com/au/app/sportsgang/id6767027447)
[![CI](https://github.com/EdwardH-jedi/Sportsgang/actions/workflows/ci.yml/badge.svg)](https://github.com/EdwardH-jedi/Sportsgang/actions/workflows/ci.yml)
[![License: source-available](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

**Live on the App Store:** [SportsGang](https://apps.apple.com/au/app/sportsgang/id6767027447) — v1.0 approved by Apple App Review on **13 May 2026**, about eight weeks after the first commit.

SportsGang is a full-stack mobile product — an Expo/React Native app backed by an async FastAPI service with PostgreSQL and Redis — currently supporting gym, golf, tennis, and running in Sydney. Protin is the internal codename, kept in package names and the permanent bundle id `com.edh1223.protin`.

[Release history and engineering decisions](docs/ENGINEERING_NOTES.md) ·
[Verification scope](docs/VERIFICATION.md) ·
[Local setup](#local-setup)

## Product preview

Recorded iOS release screenshots show the discovery, chat, and booking flows.

<p>
  <img src="docs/release/screenshots/ios/01-discovery-gym-partners.png" width="230" alt="SportsGang opponent discovery screen">
  <img src="docs/release/screenshots/ios/03-chat-confirmed-session.png" width="230" alt="Chat with a confirmed sports session">
  <img src="docs/release/screenshots/ios/05-propose-session-form.png" width="230" alt="Form for proposing a sports session">
</p>

## What it does

- **Opponent discovery** — sport-scoped partner feed with compatibility scoring; mutual likes create a match
- **Challenges** — issue, accept/decline, and record results for 1-v-1 sport challenges
- **Matches & chat** — per-match message threads with WebSocket live delivery
- **Bookings** — propose, confirm, decline, cancel, complete, or no-show a session via an explicit state machine
- **Venues** — nearby court/venue search combining a seeded database with Google Places, deduplicated by name + distance
- **Battles (group events)** — host or join open sport events with attendance confirmation
- **Tournaments** — join/leave tournaments, implemented behind a server-side feature flag (off outside local dev)
- **Ranking & honour system** — rank progression from recorded results plus an honour/reputation layer
- **Accounts & safety** — email/password and Sign in with Apple auth, profile photos, Google Calendar sync, Expo push notifications, reports, blocks, and content moderation

## Stack

| Layer | Stack |
|---|---|
| Mobile | Expo 54, React Native 0.81, React 19, TypeScript, React Navigation, Zustand |
| API | FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2, Python 3.12 |
| Data | PostgreSQL 16, Redis 7 |
| Contracts | `@protin/shared-types` — TypeScript types shared between app and API consumers |
| Infra | Docker (multi-stage API image), docker-compose, nginx, Fly.io config, GitHub Actions CI |
| Package managers | npm workspaces (JS), uv (Python) |

## Architecture

```
Expo mobile app ──HTTP + JWT──▶ FastAPI ──▶ PostgreSQL (async SQLAlchemy / Alembic)
                                   │
                                   └─────▶ Redis
        notification worker ──────▶ Expo push service
```

## Engineering highlights

- Fully async API stack: FastAPI + SQLAlchemy 2 async sessions + asyncpg, async Redis client
- 15 incremental Alembic migrations covering the whole schema history
- Booking lifecycle modelled as an explicit finite state machine on the service layer
- Field-level Fernet encryption (AES-CBC + HMAC, `cryptography` library) for stored OAuth tokens, enforced at startup
- Google Calendar OAuth `state` is a signed, 10-minute, user-bound token, so the unauthenticated callback cannot be used to link another user's account
- Rate limiting on auth and external-API-backed endpoints (slowapi)
- Multi-source venue search: seeded venue DB merged with Google Places, haversine dedup, lazy place-details loading
- Typed mobile API client with JWT handling and snake_case↔camelCase conversion, backed by a shared types package
- 26 API test files (631 tests, pytest, in-memory SQLite) and 53 mobile test suites (747 tests, Jest + React Native Testing Library)
- CI: ruff lint/format, ESLint, TypeScript typecheck, both test suites, a PostgreSQL/Redis integration job, and a Docker image build on every push
- Deployment configuration for a self-hosted staging stack (docker-compose + nginx) and Fly.io (Sydney region, API + worker processes)

## Current state

SportsGang v1.0 passed App Review in May 2026 and is listed on the App Store. This
repository is the maintained engineering source, with a local setup using Docker for
PostgreSQL/Redis, uvicorn, and Expo. The production backend is not offered here as an
always-on public demo; use the screenshots or local setup to review the product.
Download counts and active-user metrics are not tracked in this repository.

The API unit suite uses in-memory SQLite. The separate PostgreSQL/Redis CI job
runs the Alembic migration chain and a register → match → booking-confirmation
flow against disposable services; it does not validate external Apple, Google,
or Expo delivery services. See [verification scope](docs/VERIFICATION.md).

---

## Repository layout

```
.
├── .github/workflows/ci.yml     CI: lint, typecheck, tests, PostgreSQL/Redis job, Docker build
├── apps/
│   ├── api/                     FastAPI service (uv project)
│   │   ├── alembic/             database migrations
│   │   ├── app/
│   │   │   ├── core/            settings, JWT/password security, field encryption, rate limiting
│   │   │   ├── db/              SQLAlchemy engine/session, Redis client
│   │   │   ├── models/          SQLAlchemy ORM models
│   │   │   ├── routers/         HTTP/WebSocket route handlers by domain
│   │   │   ├── schemas/         Pydantic request/response models
│   │   │   ├── services/        domain logic (booking FSM, discovery, venues, integrations)
│   │   │   └── main.py          app setup, /health, router registration
│   │   ├── data/                seeded Sydney venue catalog
│   │   ├── scripts/             seed scripts (venues, bots, review data) and a live venue smoke check
│   │   ├── tests/               pytest suite (in-memory SQLite)
│   │   ├── tests_integration/   PostgreSQL + Redis booking journey (CI job)
│   │   ├── worker.py            Expo push notification worker
│   │   └── Dockerfile           multi-stage API image (built from the repository root)
│   └── mobile/                  Expo React Native app
│       ├── assets/              app icon, splash, notification icon
│       └── src/
│           ├── __tests__/       Jest + React Native Testing Library suites
│           ├── components/      shared UI primitives
│           ├── data/            static reference data
│           ├── hooks/           data-fetching hooks
│           ├── lib/             typed API client and domain helpers
│           ├── navigation/      React Navigation setup
│           ├── screens/         screens by domain
│           ├── stores/          Zustand stores
│           └── theme/           design tokens
├── packages/
│   └── shared-types/            TypeScript type contracts shared with the app
├── infra/                       nginx, systemd units, deploy/backup/health-check scripts, Fly.io notes
├── docs/                        engineering notes, verification scope, runbooks, contracts, archive
├── .env.example                 root infrastructure variables (source of truth)
├── docker-compose.yml           local PostgreSQL + Redis
├── docker-compose.staging.yml   self-hosted staging stack
├── fly.toml                     Fly.io app config (API + worker processes)
└── package.json                 npm workspace root + scripts
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| npm | 10+ | bundled with Node |
| Python | 3.12+ | [python.org](https://python.org) |
| uv | latest | `pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker Desktop | latest | [docker.com](https://docker.com) |

---

## Local setup

### 1. Copy environment files

**bash / macOS / Linux**
```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

**PowerShell**
```powershell
Copy-Item .env.example .env
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\mobile\.env.example apps\mobile\.env
```

The default values work out of the box for local development.
See [Environment variables](#environment-variables) if you need to change ports.

---

### 2. Start infrastructure

```bash
npm run infra:up
```

This starts PostgreSQL on `localhost:5432` and Redis on `localhost:6379`.

**Wait for both services to be healthy before continuing:**

```bash
npm run infra:ps
```

Expected output — both `Status` columns should read `Up (healthy)`:

```
NAME               IMAGE                COMMAND                  STATUS
protin-postgres-1  postgres:16-alpine   "docker-entrypoint.s…"  Up (healthy)
protin-redis-1     redis:7-alpine       "docker-entrypoint.s…"  Up (healthy)
```

If services show `starting` rather than `healthy`, wait 10–15 seconds and run `npm run infra:ps` again.

---

### 3. Install dependencies

```bash
npm install                       # JavaScript — mobile app + root tooling
cd apps/api && uv sync --dev      # Python — API + test dependencies
```

---

### 4. Run database migrations

From `apps/api`:

```bash
uv run alembic upgrade head
```

Expected output:

```
INFO  [alembic.runtime.migration] Context impl PostgreSQLImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
```

Migrations are a no-op if the schema is already current.
Re-run this command whenever new migration files are added.

---

### 5. Start the API

From `apps/api`:

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Verify the API is running and connected to both services:**

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","version":"0.1.0","environment":"local","uptime_seconds":12,"checks":{"db":"ok","redis":"ok"}}
```

If a dependency is unreachable, the endpoint returns HTTP 503 with `"status":"degraded"`.

If either check shows `"error"`, see [Troubleshooting](#troubleshooting).

Interactive API docs: `http://localhost:8000/docs`

---

### 6. Start the mobile app

From the repository root:

```bash
npm run mobile:start
```

Then in the Expo terminal:

| Key | Action |
|---|---|
| `a` | Open Android emulator |
| `i` | Open iOS simulator |
| `w` | Open in browser |
| Scan QR | Open in Expo Go on a physical device |

The app connects to `EXPO_PUBLIC_API_URL` from `apps/mobile/.env` (default: `http://localhost:8000`).

---

## Development scripts

All infra scripts run from the repository root via npm.

### Infrastructure

```bash
npm run infra:up           # start PostgreSQL and Redis (detached)
npm run infra:down         # stop services, keep data volumes
npm run infra:reset        # wipe volumes and restart fresh (re-run migrations after)
npm run infra:logs         # tail all service logs
npm run infra:ps           # show service status and health
```

### Mobile

```bash
npm run mobile:start       # start Expo dev server
npm run mobile:android     # open Android emulator
npm run mobile:ios         # open iOS simulator
npm run mobile:web         # open in browser
```

### Checks (repository root)

```bash
npm test                   # mobile Jest suites
npm run lint               # mobile ESLint
npm run typecheck          # mobile + shared-types TypeScript
```

### API (run from `apps/api`)

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # dev server
uv run pytest                                                       # test suite
uv run ruff check . && uv run ruff format --check .                 # lint + format check
uv run alembic upgrade head                                         # apply migrations
uv run alembic downgrade -1                                         # roll back one migration
```

---

## Health verification

Use these checks to confirm the full stack is operational before developing.

### Infrastructure

```bash
npm run infra:ps
# Both STATUS values should be "Up (healthy)"

# Check PostgreSQL directly
docker compose exec postgres pg_isready -U protin
# → /var/run/postgresql:5432 - accepting connections

# Check Redis directly
docker compose exec redis redis-cli ping
# → PONG
```

### API

```bash
curl http://localhost:8000/health
# → {"status":"ok","version":"0.1.0","environment":"local","uptime_seconds":12,"checks":{"db":"ok","redis":"ok"}}
```

Both checks inside `checks` must be `"ok"`. If either is `"error"`, the endpoint
returns HTTP 503 with `"status":"degraded"`: the service is running but cannot reach
that dependency — see [Troubleshooting](#troubleshooting).

---

## Environment variables

### `.env` (root) — Docker Compose + shared

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB` | `protin` | database name |
| `POSTGRES_USER` | `protin` | database user |
| `POSTGRES_PASSWORD` | `protin` | database password |
| `POSTGRES_PORT` | `5432` | host port for PostgreSQL |
| `REDIS_PORT` | `6379` | host port for Redis |
| `APP_ENV` | `local` | reported in `/health` response |
| `API_HOST` | `0.0.0.0` | uvicorn bind address |
| `API_PORT` | `8000` | uvicorn bind port |
| `POSTGRES_URL` | `postgresql://protin:protin@localhost:5432/protin` | used by API and Alembic |
| `REDIS_URL` | `redis://localhost:6379/0` | used by API |
| `EXPO_PUBLIC_API_URL` | `http://localhost:8000` | API base URL baked into mobile JS bundle |

### `apps/api/.env` — FastAPI runtime

The API reads `.env` from its working directory (`apps/api`). Key settings
(defaults from `apps/api/app/core/config.py`):

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `local` | `local` / `staging` / `production`; stricter startup checks outside `local` |
| `POSTGRES_URL` | `postgresql://protin:protin@localhost:5432/protin` | database URL (API and Alembic) |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis URL |
| `SECRET_KEY` | `change-me-in-production` | JWT and OAuth-state signing key; the default is refused in staging/production |
| `FIELD_ENCRYPTION_KEY` | empty | Fernet key for OAuth tokens at rest; required outside local dev (the app refuses to start without it) |
| `CORS_ORIGINS` | empty | comma-separated allowed origins; empty means `*` (local dev only) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | empty / empty / local callback | Google Calendar OAuth; empty client id disables the integration |
| `GOOGLE_PLACES_API_KEY` | empty | Google Places (New) venue provider; empty uses the seeded venue catalog only |
| `APPLE_CLIENT_ID` | empty | Sign in with Apple audience (the iOS bundle id) |
| `TOURNAMENTS_ENABLED` | on in `local`, off otherwise | tournaments feature flag |

### `apps/mobile/.env` — Expo runtime

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | API base URL baked into the JS bundle (default `http://localhost:8000`) |
| `EXPO_PUBLIC_GOOGLE_REDIRECT_URI` | Google Calendar OAuth callback URL |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | optional Google Maps key for the venue map (per-platform `_IOS_` / `_ANDROID_` variants take precedence) |
| `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_SUPPORT_URL` | legal and support links opened in-app |

The `EXPO_PUBLIC_` prefix is required by Expo to expose variables to the JavaScript bundle.

---

## Troubleshooting

### Port conflicts

If ports `5432` or `6379` are already in use on your machine, edit `.env` before starting:

```
POSTGRES_PORT=5433
REDIS_PORT=6380
```

Then update `POSTGRES_URL` to use the new port, restart infra (`npm run infra:reset`),
and re-run migrations.

### API health returns `"db": "error"`

1. Confirm PostgreSQL is healthy: `npm run infra:ps`
2. Confirm `POSTGRES_URL` in `apps/api/.env` matches the credentials in `.env`
   (default for both: `protin` / `protin` / `protin`)
3. If you reset volumes with `npm run infra:reset`, re-run migrations:
   ```bash
   cd apps/api && uv run alembic upgrade head
   ```

### API health returns `"redis": "error"`

1. Confirm Redis is healthy: `npm run infra:ps`
2. Confirm `REDIS_URL` in `apps/api/.env` matches the port in `.env`

### Migrations fail: `Connection refused`

PostgreSQL is not yet ready. Wait for `npm run infra:ps` to show `Up (healthy)`,
then retry.

### `uv` not found

Install uv:
```bash
# bash
curl -LsSf https://astral.sh/uv/install.sh | sh

# PowerShell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

---

## Stopping and resetting

```bash
npm run infra:down          # stop services, data volumes are preserved
npm run infra:reset         # wipe all data volumes and restart fresh
```

After `infra:reset`, re-run migrations before starting the API:

```bash
cd apps/api && uv run alembic upgrade head
```

---

## License

Proprietary, source-available for portfolio and evaluation purposes only — see [LICENSE](LICENSE).
