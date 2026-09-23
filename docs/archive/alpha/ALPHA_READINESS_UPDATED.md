# Protin — Alpha Readiness (Updated)

Date: 2026-04-15
Branch: `feature/wave-8-staging-readiness`
Supersedes: `docs/archive/alpha/ALPHA_READINESS.md` (2026-03-18)

This is a re-audit of the Wave 7 readiness doc against shipped code in `apps/`
after Waves 8–17 (harness, sport expansion, WebSocket chat, matching algorithm,
push-notification tests, CI pipeline, ESLint, nginx HTTP-only default).

Legend: **PASS** = implementation verified in tree · **FAIL** = doc claim
contradicted by code or required item missing · **UNKNOWN** = cannot be
verified without a deploy / device.

---

## 1. Core flows (claimed in original "What is working")

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.1 | Register + login with persistent JWT sessions | PASS | `apps/api/app/routers/auth.py` (register/login/me); `apps/mobile/src/stores/auth.ts` |
| 1.2 | Profile setup (display name, age, suburb, bio) | PASS | `apps/api/app/routers/users.py` upserts `UserProfile`; `apps/mobile/src/screens/onboarding/*` |
| 1.3 | Identity preferences (gender, sport prefs) | PASS | `users.py` `/me/identity-preferences` |
| 1.4 | Sport profiles for **gym and golf** | FAIL — scope drift | `OnboardingStep3Screen.tsx` and `DiscoveryScreen.tsx` ship **gym/golf/tennis/running**. The original scope was gym+golf only. `ProfileScreen` still hard-codes `sport === 'gym' ? 'Gym' : 'Golf'` so tennis/running render incorrectly. Either narrow back or close the rendering gap before alpha. |
| 1.5 | Discovery feed with Like / Pass / Save | PASS | `routers/discovery.py`, `useDiscovery.ts`, `DiscoveryScreen.tsx` |
| 1.6 | Bidirectional block filter in discovery | UNKNOWN | Block endpoints exist (`routers/safety.py`); confirm `services/discovery.py` joins on both directions of `blocks` (not re-read this audit). |
| 1.7 | Mutual match creation + match list | PASS | `routers/matches.py`, `MatchesScreen.tsx` |
| 1.8 | Chat between matched users | PASS | `routers/chat.py`, `ChatScreen.tsx` |
| 1.9 | Booking propose / confirm / decline / cancel / complete / no-show | PASS | All six transitions wired in `routers/bookings.py`; role-aware buttons in `BookingDetailScreen.tsx` |
| 1.10 | Device calendar integration | PASS | `lib/calendar.ts` uses `expo-calendar`; "Add to Calendar" surfaces only on confirmed bookings |

## 2. Infrastructure

| # | Item | Status | Evidence |
|---|---|---|---|
| 2.1 | Postgres + Redis on docker-compose with persistent volumes | PASS | `docker-compose.yml` declares `postgres_data` + `redis_data` |
| 2.2 | nginx reverse proxy on port 80 | PASS | `docker-compose.staging.yml` exposes 80/443 with `infra/nginx/nginx.conf` |
| 2.3 | Background worker for push delivery | PASS | `apps/api/worker.py`, wired in staging compose with healthcheck |
| 2.4 | Health endpoint with dependency status | PASS | `apps/api/app/main.py` `/health` checks db + redis, returns 503 on degrade |

## 3. Manual configuration before alpha

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | `.env.staging` populated on the home staging server (SECRET_KEY, POSTGRES_PASSWORD) | UNKNOWN | Cannot inspect server. `.env.staging.example` exists per `docker-compose.staging.yml`. |
| 3.2 | Google OAuth credentials configured | UNKNOWN | Optional; mobile gracefully no-ops if unset (`ProfileScreen` swallows). |
| 3.3 | ≥2 test accounts with sport profiles | UNKNOWN | QA precondition; not verifiable in repo. |
| 3.4 | Physical device for push validation | UNKNOWN | Requires hardware. |

## 4. Limitations table re-check (was Wave 7 truth)

| # | Original claim | Current status | Action |
|---|---|---|---|
| 4.1 | Chat: no real-time messaging | **FAIL — claim is now stale** | WebSocket implemented: `routers/chat.py` `_ConnectionManager` + `/matches/{id}/ws`; `ChatScreen.tsx` opens `ws://...?token=...`. Doc must be rewritten. Also revisit `KNOWN_ISSUES.md` NB-004. |
| 4.2 | Chat: no read receipts | PASS (still true) | No read state in `Message` model. |
| 4.3 | Booking composer: manual text input | PASS (still true) | `BookingComposerScreen.tsx` uses `TextInput` for date/time. |
| 4.4 | Booking composer: no date picker | PASS (still true) | Same as 4.3. |
| 4.5 | Discovery: initials avatar only | PASS (still true) | `Avatar` in `DiscoveryScreen.tsx` derives initials; no photo upload route. |
| 4.6 | Discovery: no advanced filters | PASS (still true) | Filter button is `disabled` in `DiscoveryScreen.tsx`. |
| 4.7 | Google Calendar: HTTP only on staging LAN | PASS (still true) | nginx config defaults HTTP-only. |
| 4.8 | Push notifications: requires physical device | PASS (still true) | `lib/notifications.ts` skips silently when `getExpoPushTokenAsync` fails. |
| 4.9 | Matches: no conversation preview | PASS (still true) | `MatchesScreen.tsx` shows partner + sport badge only. |

## 5. Out-of-scope items (re-confirm)

All still out of scope, code-verified absent: payments, admin dashboard,
video/voice, advanced calendar availability matching, photo upload, store
distribution. **PASS** across the board.

## 6. Proposed alpha entry criteria

| # | Criterion | Status | Notes |
|---|---|---|---|
| 6.1 | Home staging server deployed; `/health` returns ok | UNKNOWN | Server-side check. |
| 6.2 | Two test accounts with full profiles + sport profiles | UNKNOWN | QA precondition. |
| 6.3 | Mutual match creatable end-to-end on two devices | UNKNOWN | Code path exists; needs device run. |
| 6.4 | Booking propose → confirm → calendar add | UNKNOWN | Code path exists; needs device run. |
| 6.5 | `docs/archive/staging/QA_CHECKLIST.md` passes without blockers | UNKNOWN | Not yet executed against this branch. |

## 7. New issues surfaced by this audit (not in original doc)

| ID | Severity | Issue |
|---|---|---|
| NEW-001 | Medium | Sport scope drift: tennis/running shipped in onboarding/discovery but `ProfileScreen.tsx` only labels gym/golf and the original scope was gym+golf only. Either gate behind a flag or finish the UI before alpha. |
| NEW-002 | Low | `KNOWN_ISSUES.md` NB-004 ("Chat does not auto-refresh") is now incorrect — WebSocket is wired. Update or delete. |
| NEW-003 | Low | `ALPHA_READINESS.md` "Wave 7 improvements summary" is frozen at Wave 7; Waves 8–17 changes (WebSocket, matching algorithm, CI, ESLint, nginx HTTP-only) are unrecorded. |
| NEW-004 | Low (pre-prod) | `models/google_calendar.py` stores tokens in plaintext; acceptable for alpha but must be encrypted before production. |
| NEW-005 | Low | `apps/mobile/src/lib/api.ts` debug logs; verify removed before broader alpha distribution. |

## 8. Go / no-go summary

- **Code surface for the documented alpha scope is PASS** — every original
  "what is working" line maps to shipped code, and the documented
  limitations remain accurate except chat (which is now better than
  documented).
- **Two doc updates are required before sign-off**: refresh the chat
  limitation language, and either narrow the sport list back to gym+golf
  or finish the tennis/running UI rendering in `ProfileScreen.tsx`.
- **Five UNKNOWN items** are all server/device validations that must be
  performed by QA on the home staging server against this branch — they are not blockers
  to declaring the build *ready for QA*, only to declaring alpha *open*.

**Recommendation: GO for QA pass on this branch** once NEW-001 and NEW-002
are resolved; **NO-GO for opening alpha** until items 6.1–6.5 are checked
green by QA.
