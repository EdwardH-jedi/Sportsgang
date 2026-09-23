# SportsGang — Engineering Notes

Release timeline, implemented scope, and the engineering decisions behind SportsGang.
Claims below are verifiable from code, tests, migrations, CI, deploy configuration, and
the recorded release history.

## Naming: SportsGang and Protin

**SportsGang** is the public product name used on the App Store. **Protin** is the
internal codename the project started with. It is intentionally kept in technical
identifiers — the npm workspace packages (`@protin/*`), the Expo slug, the Fly.io app
names, and the iOS bundle identifier `com.edh1223.protin`, which is permanent once an
app has been released on the App Store.

## One-line description

Peer sports matchmaking on mobile — find opponents by sport, issue challenges, book
nearby courts, and track results through a ranking and honour system.

## Release outcome

- **Initial commit:** 18 March 2026.
- **App Store submission:** SportsGang v1.0 submitted 10 May 2026 at 9:45 PM PDT.
- **App Review:** one documented rejection / changes-needed cycle on 12 May 2026.
- **Resolution:** the repository release history records the issue as Apple Guideline
  2.1(a) / App Completeness: the reviewer account reached an empty production
  Discover feed. I added an idempotent production review-data seed with a reviewer
  account, demo discovery candidates, matches, chats, and bookings, then verified the
  review path against the deployed HTTPS API.
- **Approval:** Apple completed review on 13 May 2026, accepted SportsGang v1.0 for
  iOS, marked it eligible for distribution, and separately confirmed that SportsGang
  had been **approved for distribution**.
- **App Store record:** <https://apps.apple.com/au/app/sportsgang/id6767027447>.
- **First commit → App Store approval:** approximately **56 days / 8 weeks**.

The App Store emails confirm approval and distribution eligibility. Download counts,
active-user counts, and other post-launch product metrics are not tracked in this
repository, so no adoption numbers are claimed here.

## Problem / purpose

Finding a workout or sports partner at your level, at a time and venue that works, is
mostly ad-hoc (group chats, notice boards). SportsGang makes it a first-class product flow:
discover a compatible partner for a specific sport, challenge them, book a venue for
the session, and build a track record through results, rank, and honour.

## Stack

- **Mobile:** Expo 54, React Native 0.81, React 19, TypeScript, React Navigation,
  Zustand, Jest + React Native Testing Library
- **API:** FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2, PyJWT,
  slowapi rate limiting, Python 3.12, uv
- **Data:** PostgreSQL 16, Redis 7
- **Contracts:** `@protin/shared-types` npm workspace package shared across the app
- **Infra:** Docker (multi-stage API image), docker-compose (local + staging), nginx,
  Fly.io configuration, GitHub Actions CI

## Architecture

```
Expo mobile app ──HTTP + JWT──▶ FastAPI ──▶ PostgreSQL (async SQLAlchemy / Alembic)
                                   │
                                   └─────▶ Redis
        notification worker ──────▶ Expo push service
```

A single FastAPI service exposes the REST API; a separate worker process
(`apps/api/worker.py`) polls scheduled notification events and delivers Expo push
notifications. The mobile app talks to the API through a typed HTTP client that
handles JWT auth and snake_case↔camelCase conversion, with request/response shapes
defined in the shared-types package.

## Implemented capabilities

- Auth: email/password registration + login (JWT), Sign in with Apple (including
  token revocation on account deletion), rate-limited auth endpoints
- Profiles: user profile, per-sport profiles (gym / golf / tennis / running), identity
  preferences, profile photo upload
- Discovery: sport-scoped partner feed with compatibility scoring; like/pass/save
  actions; mutual likes create a match
- Matches & chat: match list/archive, per-match message threads with a WebSocket
  endpoint for live message delivery
- Challenges: create, accept, decline, cancel, submit results (1-v-1)
- Bookings: full lifecycle (propose → confirm/decline → cancel/complete/no-show)
  implemented as an explicit state machine, with venue attachment
- Venues: nearby search merging a seeded venue DB with Google Places (haversine
  distance, name+proximity dedup), lazy place-details lookup, rate limited
- Battles (group events): create, join/leave, cancel/complete, host- and
  self-reported attendance
- Tournaments: list, detail, join, leave — backend only, behind a server-side
  feature flag (`TOURNAMENTS_ENABLED`, on by default only in local dev); the
  unreachable mobile screens were removed
- Rank & honour system: rank events from results, honour/reputation endpoints
- Integrations: Google Calendar OAuth + booking sync, Expo push notifications with a
  background delivery worker
- Safety: user reports, block/unblock, content moderation checks

## Technically interesting decisions

1. **Booking lifecycle as an explicit FSM.** Transitions live in a single declarative
   table in `apps/api/app/services/bookings.py`, so every state change (confirm,
   decline, cancel, complete, no-show) is validated in one place, and downstream
   effects such as notification scheduling hang off transitions rather than being
   scattered across route handlers.
2. **Field-level encryption enforced at boot.** Google OAuth tokens are stored via an
   `EncryptedString` SQLAlchemy type (Fernet: AES-CBC + HMAC). Outside local dev, the
   app refuses to start without `FIELD_ENCRYPTION_KEY`, so plaintext secrets cannot
   silently reach a real environment.
3. **Multi-source venue search.** Nearby venue results merge a seeded database with
   live Google Places responses, deduplicating by normalised name plus ~100 m
   haversine proximity, with place details lazy-loaded per selection to keep external
   API usage (and rate limits) under control.
4. **App Review recovery as a reproducible production workflow.** After the first
   review cycle exposed an empty reviewer experience, `seed_review_data.py` made the
   review dataset idempotent and future-facing instead of relying on manual database
   edits. The seeded account, discovery feed, matches, chats, and bookings could be
   regenerated before review and verified through the public API.
5. **Signed OAuth state for Google Calendar linking.** The OAuth callback is reached
   by a browser redirect from Google, so it cannot carry the user's bearer token. The
   `state` parameter is therefore a short-lived (10-minute) HS256 JWT bound to the
   user id, with a random nonce and a dedicated audience so ordinary access tokens
   cannot be replayed as a state. Forged, tampered or expired states are rejected
   before any token exchange (`apps/api/app/services/google_calendar.py`).

## Release / deployment facts

- Apple Developer Program and App Store Connect setup were completed for SportsGang.
- A production Fly.io backend was exercised during the App Review recovery flow.
- Reviewer data was verified end-to-end through the deployed public HTTPS API.
- SportsGang v1.0 passed App Review and was approved for App Store distribution on
  13 May 2026.
- The approval email includes the App Store record URL for app ID `6767027447`.
- No download, MAU, retention, or other adoption metrics are claimed because they are
  not tracked in this repository.

## Current limitations

- Public adoption metrics are not available in the repository, so download counts and
  active-user counts should not be invented or inferred from App Store approval.
- API unit tests run against in-memory SQLite. A separate PostgreSQL/Redis CI
  integration job exercises the Alembic chain and the booking journey; see
  [verification scope](VERIFICATION.md). This is not a production load test.
- Media (profile photos) is stored on local disk; cloud object storage is not yet
  implemented.
- Opponent discovery filters by sport and profile compatibility, not by geographic
  proximity (location is used for venue search only).
- Tournaments are backend-only (API behind a feature flag); there is no mobile UI.
