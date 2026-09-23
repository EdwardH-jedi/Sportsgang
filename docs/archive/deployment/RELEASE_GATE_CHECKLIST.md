# Protin - Release Gate Checklist

Canonical go/no-go artifact for moving Protin between release stages. Use this
document to decide one question: **is Protin ready to move to the next release
stage yet?**

It does not teach release mechanics (see the runbook), it does not define App
Store metadata (see the submission doc), and it does not set product strategy.
It tells a human whether to **stop, continue verification, or advance** to the
next gate.

This document tracks **current branch/repo readiness**: what is in the
working repo right now across code, test coverage, and device / Apple-side
verification. It is a readiness tracker, not a historical committed-main
audit; a gate row is true when the evidence it cites is present in the
repo today.

For detailed Apple / TestFlight preparation status (configured / blocked /
Apple-side setup required / verify on real device, with concrete next
actions), see `docs/archive/deployment/APPLE_TESTFLIGHT_PREP.md`. That prep doc is
the source of truth for Apple-side setup detail; this doc is the source of
truth for the go/no-go gate decision.

---

## 1. Purpose and Scope

This checklist decides stage readiness. It does not redesign release strategy
or rewrite the existing runbook and submission docs.

Three gates, in order:

- **Gate 1 - Internal Beta.** Company-side humans can exercise the app
  against a usable backend.
- **Gate 2 - TestFlight.** The iOS binary and its Apple-side distribution
  path are real, and core flows are proven on a real iPhone.
- **Gate 3 - Submission Prep.** Everything a reviewer touches is verified,
  every user-visible feature has proof, and App Store Connect is complete.

Status vocabulary used throughout:

| Status       | Meaning |
|---           |---|
| implemented  | Code or config is present in the repo. Does not imply it works on a device. |
| verified     | Proven by a dated device or staging run. Evidence captured in this doc. |
| required     | Apple-side or external setup that must be completed before a given gate. |
| blocked      | A concrete gap that prevents the stated gate from passing today. |
| risky        | Present in the app but unproven; must be verified or hidden before its gate. |

Unknown status is treated as **not ready**. Never default to "probably fine".

---

## 2. How to Use This Checklist

Rules for reading this document:

- Repo implementation alone never passes a gate. Every implemented item must
  be paired with a "does not prove" line. Readiness comes from the verified
  and required columns, not the implemented one.
- "Implemented in Repo" means the evidence cited is present in the current
  repo. It does not imply the feature has been exercised on a device or
  against a live backend.
- A gate passes only when **every must-pass item** in that gate's section is
  satisfied. Partial is not a pass.
- If a line item's status is unknown, treat it as **blocked** for the gate in
  question until someone records evidence.
- Do not copy claims from companion docs. If `APP_STORE_SUBMISSION.md` says a
  thing is implemented and you cannot see the evidence in the repo or in a
  dated device run, record it as `verify` here.
- When an item is verified, write the date and the owner into the evidence
  field. Verification without a date is not verification.

---

## 3. Implemented in Repo

Only items whose evidence lives in the current repo. "Does not prove" is
mandatory - it is the gap this checklist is here to close.

### 3.1 Auth / account lifecycle

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Email / password register and login | `POST /auth/register`, `POST /auth/login` in `apps/api/app/routers/auth.py`; mobile uses `useAuthStore.login/register` in `apps/mobile/src/stores/auth.ts` | That login works against the staging backend from a real device, that session restore survives app relaunch, or that password recovery exists |
| Sign in with Apple | `POST /auth/apple` token verification path in `apps/api/app/routers/auth.py`; mobile button wired in `apps/mobile/src/screens/auth/LoginScreen.tsx` via `expo-apple-authentication`, iOS-gated | That Apple sign-in succeeds on a real iPhone, that the account is linked correctly, or that `APPLE_CLIENT_ID` is configured on the deployed backend |
| Session persistence | Token stored via `expo-secure-store` and restored on init in `apps/mobile/src/stores/auth.ts` (`initialize()` calls `api.get('/auth/me')`) | That re-login after logout, kill-and-reopen, and token expiry all behave correctly on device |
| Logout | `useAuthStore.logout()` clears secure store and token | That the UI consistently returns to the login screen and that server-side token handling matches |

### 3.2 Delete-account

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Server-side account deletion endpoint | `DELETE /auth/me` at `apps/api/app/routers/auth.py:184` | That it removes every owned record on the deployed DB, or that the mobile client actually calls it end-to-end |
| In-app "Delete my account" surface | Action present in `apps/mobile/src/screens/profile/ProfileScreen.tsx` | That a real user can find it, that the confirmation path completes, and that post-delete state (logout, cannot log back in with same credentials) is correct |

### 3.3 Push notifications plumbing

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Expo push integration declared | `expo-notifications` plugin entry and `notification-icon` reference in `apps/mobile/app.config.js` | That a signed build can actually register for push on Apple's APNs |
| iOS background mode for push | `UIBackgroundModes: ["remote-notification"]` in `apps/mobile/app.config.js` | That the entitlement is granted by Apple Developer and that the bundle ID has APNs capability enabled |
| Backend notification API | `POST /notifications/token` and the internal processor in `apps/api/app/routers/notifications.py` and `app/services/notifications.py` | That Expo's push service is reachable from the deployed backend and that pushes actually arrive on a real iPhone |
| Internal-endpoint shared-token gate | `require_internal_token` dependency and `validate_internal_api_token_config` boot gate in `apps/api/app/routers/notifications.py`; `internal_api_token` setting in `apps/api/app/core/config.py`; lifespan wiring in `apps/api/app/main.py`; `INTERNAL_API_TOKEN` entry in `.env.staging.example` | That the secret is actually set on the deployed staging/production host; that callers to `/internal/*` are sending `X-Internal-Token` |
| UTC-safe scheduling | `_ensure_utc` helper in `apps/api/app/services/notifications.py` applied in `process_pending_notifications` before datetime arithmetic | That the deployed DB + driver combo does not introduce other timezone edge cases |

### 3.4 Google Calendar integration

| Capability | Repo evidence | Does not prove |
|---|---|---|
| iOS calendar usage description | `NSCalendarsUsageDescription` in `apps/mobile/app.config.js` | That the permission prompt appears at the right moment and is granted |
| Mobile calendar helper | `apps/mobile/src/lib/calendar.ts` (add-to-calendar plumbing) | That calendar events are actually created on a real device after a booking confirmation |
| Backend Google OAuth config path | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` documented in the runbook (Fly secrets) | That OAuth is fully wired for the server-side Google Calendar flow end-to-end |

### 3.5 Backend / staging support

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Staging deploy script and operator wrapper | `infra/scripts/deploy.sh`, `infra/scripts/health-check.sh`, and `infra/scripts/staging-ops.sh` (health / logs / tail / restart / drift / deploy-sanity); staging operator guide in `docs/archive/staging/RUNBOOK.md` | That a reviewer-usable staging environment is currently live |
| Encryption and boot guards | `validate_encryption_config()` in `apps/api/app/core/encryption.py` refuses to start without `FIELD_ENCRYPTION_KEY` in staging or prod; wired in `apps/api/app/main.py` lifespan | That secrets are actually present on the deployed host |
| Health endpoint | `/health` handler in `apps/api/app/main.py` | That the external hostname is reachable and HTTPS-only at gate time |

### 3.6 Legal and support surface already present in repo

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Legal links in-app | `apps/mobile/src/lib/legal.ts` consumed by the Register footer and the Profile Legal section | That the URLs referenced are publicly hosted and reachable |
| Privacy and Terms source docs | `docs/legal/PRIVACY_POLICY.md`, `docs/legal/TERMS_OF_SERVICE.md` | That these are hosted at the URLs referenced by the app |

---

## 4. Needs Real-Device Verification

Every item below is **not** proven by repo code. It needs a dated run on a
real iPhone or a dated, human-attended staging run. Empty evidence means not
done.

### Current verification state

Single source of truth for where the five priority areas stand right now.
Subsections 4.1 through 4.5 rest on this summary.

- **Backend coverage is in the repo.** `apps/api/tests/` has
  `test_auth.py`, `test_notifications.py`, `test_google_calendar.py`, and
  `test_health.py`. These exercise the full backend surface for auth,
  delete-account, notification scheduling and delivery, the
  `X-Internal-Token` gate, Google Calendar OAuth + token-at-rest
  encryption, and the `/health` endpoint shape. Two pre-existing tests
  fail against current app behavior and are called out as a blocker in
  section 6.1; they are unrelated to the five priority areas.
- **Mobile typecheck is clean** (`tsc --noEmit`) after the shared-types
  alignment that consolidates auth/onboarding/profile types with
  `@protin/shared-types`.
- **No real-iPhone verification has been performed for sections 4.1
  through 4.5.** Every row in those subsections that requires a device
  run is `[ ]`.
- **Real-iPhone verification HAS been performed for sections 4.6
  through 4.10** — legal/support links, chat ownership, account
  switching for chat QA, session proposal cards, Accept/Decline, and
  the Events tab. See those subsections for dated evidence.
- **No live staging URL has been probed.** Backend reachability from
  outside the Docker network, HTTPS health, and reviewer-account login
  against a live host are open.
- **No Apple-side state exercised.** Every row in section 5 remains
  open.

The per-subsection notes under 4.1 through 4.5 describe which test file
backs each priority area. They do not add new verification claims beyond
this summary. Subsections 4.6 through 4.10 record device runs that have
been performed.

### 4.1 Auth / account lifecycle

Backend coverage: `apps/api/tests/test_auth.py` covers register, login
(correct + wrong password), `GET /auth/me` (valid / invalid token),
delete-account (+ owned-rows cleanup + auth requirement), Apple
Sign-In (first call, invalid token, 503 when unconfigured,
email-linking, nonce mismatch, first-time without verified email,
password-login rejection for Apple-only accounts), and the
`SECRET_KEY` fail-closed behavior. One baseline test failure is
tracked in section 6.1. Does **not** prove any real-iPhone behavior.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Email/password register, logout, re-login on real iPhone | mobile | short screen-recording or notes plus account ID | [ ] |
| Session restore across app kill/relaunch | mobile | notes that token persisted via SecureStore | [ ] |
| Sign in with Apple on real iPhone against live backend | mobile | linked account ID, which `APPLE_CLIENT_ID` was active | [ ] |
| Apple account linking if email already exists | mobile / api | documented outcome (link vs reject) | [ ] |
| Logout returns to login screen and clears token | mobile | notes | [ ] |

### 4.2 Delete-account (full end-to-end, device)

Backend coverage: `apps/api/tests/test_auth.py::test_delete_me_removes_user_and_owned_rows`
and `::test_delete_me_requires_auth`. The endpoint removes the user
and owned rows at the API/DB layer and refuses unauthenticated
requests. Device verification still required for the mobile-side
flow.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Delete button discoverable from Profile on real device | mobile | screenshot | [ ] |
| Delete completes without error against deployed backend | mobile and api | API log or notes | [ ] |
| Post-delete: user logged out, cannot log back in with same credentials | mobile and api | notes | [ ] |
| Post-delete: owned rows removed or anonymized as policy requires | api | DB-level spot check notes | [ ] |

### 4.3 Push notifications (device proof, not code)

Backend coverage: `apps/api/tests/test_notifications.py` exercises
token register/unregister (auth required), idempotent re-register,
token reassignment across users, immediate vs 24h-before reminder
scheduling, `_render` templates, transition notifications
(confirm / decline / cancel), delivery pass / fail / dedup paths, the
UTC-safe `_ensure_utc` regression, and the INTERNAL_API_TOKEN boot
validator + request-time gate. Does **not** prove APNs delivery or
any real-iPhone behavior.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Permission prompt shown and accepted on real iPhone | mobile | screenshot | [ ] |
| Expo push token returned and registered via `POST /notifications/token` | mobile and api | token prefix plus server log | [ ] |
| Backend-triggered push arrives on real iPhone | api and mobile | timestamp of send plus received | [ ] |
| Tapping a push opens the intended screen | mobile | notes | [ ] |
| Permission denial path handled gracefully | mobile | notes | [ ] |

### 4.4 Google Calendar (optional integration)

Backend coverage: `apps/api/tests/test_google_calendar.py` covers
OAuth status (connected / not / auth required), auth-URL generation
(configured / 503 when unconfigured), OAuth-callback token storage
and at-rest encryption, `sync_booking` guards on status and Google
connection, Fernet-key encryption round-trip and legacy-plaintext
path, and the `validate_encryption_config` gate for staging /
production. Does **not** prove the iOS device permission prompt, the
OAuth browser round-trip, or the return-to-app redirect.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Calendar permission prompt appears on "Add to calendar" | mobile | screenshot | [ ] |
| Event actually lands on the device calendar after a confirmed booking | mobile | screenshot | [ ] |
| Permission denial path does not break booking flow | mobile | notes | [ ] |

### 4.5 Onboarding and session

Backend coverage: `apps/api/tests/test_health.py` covers `/health`
happy path and service-check shape. One baseline test failure is
tracked in section 6.1. No backend equivalent exists for onboarding
screen flow; this area is device-only for the mobile side.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Full onboarding (profile -> identity preferences -> sport profiles) on real iPhone | mobile | screen-recording or stepped notes | [ ] |
| App survives a cold start post-onboarding and lands on Discovery feed | mobile | notes | [ ] |

### 4.6 Legal and support links (real-device tap-through)

The static legal/marketing site is deployed to Netlify at
`https://sportgang.netlify.app/`; all four routes return `200 OK` HTML
over HTTPS. The three `EXPO_PUBLIC_*_URL` env vars are pinned on the
EAS `preview` and `production` environments (verifiable with
`eas env:list --environment {preview,production}`). On 2026-05-05 the
in-app links were tap-tested on a real iPhone via Expo Go / local
development run; all five links opened the expected Netlify pages
without a "link unavailable" alert, without a 404, and without
crashing the app. Detailed checklist + failure triage live in
`docs/archive/deployment/APPLE_TESTFLIGHT_PREP.md` section 4.8.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Privacy link opens `https://sportgang.netlify.app/privacy/` from the in-app affordance on a real iPhone | mobile | operator-confirmed PASS via Expo Go / local dev run | [x] PASS — 2026-05-05 |
| Terms link opens `https://sportgang.netlify.app/terms/` from the in-app affordance on a real iPhone | mobile | operator-confirmed PASS via Expo Go / local dev run | [x] PASS — 2026-05-05 |
| Support link opens `https://sportgang.netlify.app/support/` from the in-app affordance on a real iPhone | mobile | operator-confirmed PASS via Expo Go / local dev run | [x] PASS — 2026-05-05 |
| No "link unavailable" alert on any of the three taps | mobile | operator-confirmed PASS | [x] PASS — 2026-05-05 |
| No 404 on any loaded page | mobile | operator-confirmed PASS | [x] PASS — 2026-05-05 |
| App does not crash; user can return to the app after opening a link | mobile | operator-confirmed PASS | [x] PASS — 2026-05-05 |

### 4.7 Chat ownership and account switching (real iPhone)

The chat ownership regression that landed messages on the wrong side of
the conversation when the same device switched accounts is fixed. On
2026-05-06 the operator ran a two-account Chris/Sarah message exchange
on a real iPhone via Expo Go against the local API. Behind the fix is
a versioned auth-op guard in `apps/mobile/src/stores/auth.ts` that
drops stale `/auth/me` results from a prior login when a logout or new
login has already moved the device on; the chat-bubble ownership check
now compares strict `senderId === currentUserId`. Backend Codex review
confirmed `messages.sender_id` persists per-bearer-token and is
unaffected by mobile state.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Two-account Chris/Sarah message exchange completes without error | mobile | operator-confirmed PASS via Expo Go / local API | [x] PASS — 2026-05-06 |
| Messages sent by the current user render right / neon | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Messages from the partner render left / dark | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Account switching no longer flips every message to "current user" rendering | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Backend `messages.sender_id` matches the bearer used at POST time | api | Codex direct DB check confirming sender_id per token | [x] PASS — 2026-05-06 |
| Deterministic Chris/Sarah local seed reset script exists | api | local-only QA seed reset script (commit `553adda`; since removed from the repository) | [x] PASS — 2026-05-06 |

Key commits backing this row: `77d92f8` (chat message ownership
alignment), `c0a5dce` (hydrate auth user after login), `10fd959` (auth
account switching token state), `553adda` (Chris/Sarah seed reset
script). This row covers chat-QA-only account switching; full auth
lifecycle on device (Apple sign-in, session restore across kill+launch,
etc.) remains tracked under section 4.1 and is still `[ ]`.

### 4.8 Session proposal in chat (Accept / Decline)

Session/court proposals now appear in chat as a card. The proposer
sees `Session proposal sent` + `Awaiting confirmation`; the receiver
sees the proposal details with **Accept** and **Decline** buttons.
Tapping either calls the existing `POST /bookings/{id}/{confirm,decline}`
FSM endpoints. Tested on 2026-05-06 on a real iPhone via Expo Go.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Proposer can send a court/session proposal from chat composer | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Proposer sees an `Awaiting confirmation` card in the chat timeline | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Receiver sees the proposal card with sport, date/time, venue/location, and Accept/Decline buttons | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Accept transitions the card to `Session confirmed` for both participants on refresh/focus | mobile + api | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| BookingDetail screen reachable from the card and shows confirmed details | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Decline drops the card from the active proposed state without affecting unrelated history | mobile + api | operator-confirmed PASS | [x] PASS — 2026-05-06 |

Key commits backing this row: `b079880` (show session proposals in
chat). The chat surface intentionally hides cancelled bookings in v1
and shows declined as a terminal pill; broader booking lifecycle
checks (no-show / completion / mid-flight cancel) are not part of
this row.

### 4.9 Events tab

A fourth bottom tab (`Events`) was added between Matches and Profile.
It surfaces both upcoming confirmed sessions and pending proposals
fed by `GET /bookings`. Verified on 2026-05-06 on a real iPhone via
Expo Go.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Bottom tabs render in order Discover · Matches · Events · Profile | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Events tab is visible and selectable | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| `Upcoming sessions` section shows a confirmed future session with the correct sport / date / time / venue / partner | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| `Pending proposals` section shows an in-flight proposal (incoming or outgoing) with the matching state | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Tab uses the SportsGang dark / neon style consistent with other tabs | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| No push notification permission prompt fires on the Events tab | mobile | operator-confirmed PASS — no system prompt observed | [x] PASS — 2026-05-06 |
| No calendar permission / sync prompt fires on the Events tab | mobile | operator-confirmed PASS — no system prompt observed | [x] PASS — 2026-05-06 |
| Discover, Matches, and Profile tabs still reachable and unbroken | mobile | operator-confirmed PASS | [x] PASS — 2026-05-06 |
| Profile Legal / Support / Logout / Delete account controls remain reachable after Events tab insertion | mobile | not separately reconfirmed after Events tab landed | [ ] PENDING — final visual recheck on real iPhone |

Key commits backing this row: `ac10c67` (add events tab for
sessions), `b71951d` (Profile Upcoming sessions card). Profile-tab
account-control reachability has not been explicitly retapped after
the tab insertion; treat as pending until a dated tap-through is
captured. The runtime regression tests in
`apps/mobile/src/__tests__/ProfileScreen.test.tsx` cover the rendering
of those controls but do not constitute a device run.

### 4.10 Propose-a-session calendar alignment

The custom date picker in the BookingComposer "Propose a session"
flow had drifted column positions on real iPhones (May 1 2026 was
landing off the Friday header). The fix swaps the `space-between`
layout for a deterministic 1/7 flex-basis column geometry and pins
the day-cell positions via a `buildMonthGrid` helper covered by jest.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| `buildMonthGrid(2026, 4)` places May 1 at column index 5 (Friday) | mobile | jest unit + component tests in `apps/mobile/src/__tests__/sessionTime.test.ts` and `CalendarPicker.test.tsx` | [x] PASS — 2026-05-06 |
| May 2026 day cells visually align under their Sunday-first header columns on a real iPhone | mobile | operator-confirmed visual recheck after the fix | [ ] PENDING — implemented; pending final visual recheck on real iPhone |
| Selected and today indicators stay attached to the correct date cell | mobile | operator-confirmed visual recheck | [ ] PENDING — implemented; pending final visual recheck on real iPhone |

Key commit backing this row: `56d338b` (fix session calendar weekday
alignment). The fix has unit and component coverage but the on-device
visual recheck has not been recorded yet.

### 4.11 Final local iOS screenshot package

The six final iOS screenshots for v1 submission are committed at
`docs/release/screenshots/ios/` in the order Apple shows them in the
App Store search-results card. Local package only — this row does NOT
imply the screenshots have been uploaded to App Store Connect, that
device-class resolution sets have been generated, or that any
TestFlight build has been cut.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| `01-discovery-gym-partners.png` present in repo | release owner | file at `docs/release/screenshots/ios/01-discovery-gym-partners.png` | [x] PASS — 2026-05-06 |
| `02-matches-message-previews.png` present in repo | release owner | file at `docs/release/screenshots/ios/02-matches-message-previews.png` | [x] PASS — 2026-05-06 |
| `03-chat-confirmed-session.png` present in repo | release owner | file at `docs/release/screenshots/ios/03-chat-confirmed-session.png` | [x] PASS — 2026-05-06 |
| `04-events-sessions.png` present in repo | release owner | file at `docs/release/screenshots/ios/04-events-sessions.png` | [x] PASS — 2026-05-06 |
| `05-propose-session-form.png` present in repo | release owner | file at `docs/release/screenshots/ios/05-propose-session-form.png` | [x] PASS — 2026-05-06 |
| `08-profile-legal-account.png` present in repo | release owner | file at `docs/release/screenshots/ios/08-profile-legal-account.png` | [x] PASS — 2026-05-06 |
| Final order matches `APP_STORE_METADATA.md` §11 capture order | release owner | filenames sort by leading number into the §11 order | [x] PASS — 2026-05-06 |
| Per-device-class capture set generated (iPhone 16 Pro Max 6.9", iPhone 14 Plus 6.5") | release owner | per-device PNGs at the resolutions in `APP_STORE_SUBMISSION.md` §9 | [ ] PENDING |
| Screenshots uploaded to App Store Connect | operator | ASC screenshot panel populated for both device classes | [ ] PENDING |

Captions, surface choices, and v1-safety guidance live in
`APP_STORE_METADATA.md` §11. The local package is intentionally six
images — Auth/Login and Onboarding screens were considered for the
search-results carousel but cut so the visible story leads directly
with the core loop (Discover → Match → Chat → Events).

### 4.12 App Store metadata copy review

A full sweep of the App Store text fields — App Store name and
subtitle, promotional text, description, keywords, category
recommendation, age rating, URLs, review notes, demo-account
placeholders, privacy-label notes, screenshot checklist, and the
remaining open-items table — landed on 2026-05-06. The promotional
text (§2) and description (§4) in `APP_STORE_METADATA.md` now
explicitly reference the shipped session-proposal flow and the
Events tab; the review-notes walkthrough (§9) extends through
propose → Accept/Decline → Events. The keyword string is unchanged
(no v1-hidden-feature terms). The submission doc
(`APP_STORE_SUBMISSION.md` §7-9 and §12) was rewritten to defer to
the metadata doc for review-notes / description / keywords / lineup
and dropped its earlier swipe / Add-to-Calendar / push-notifications
copy so the two docs are in lockstep.

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| App name / subtitle / promo coherent and v1-safe | release owner | `APP_STORE_METADATA.md` §1-3 | [x] PASS — 2026-05-06 |
| Description reflects the actual v1 surfaces (no swipe / no calendar / no push / no tournaments / no rank / no group events / no dating framing) | release owner | `APP_STORE_METADATA.md` §4 | [x] PASS — 2026-05-06 |
| Keyword string has no unsupported feature terms | release owner | `APP_STORE_METADATA.md` §5 | [x] PASS — 2026-05-06 |
| Age rating consistent at 17+ across all four release docs | release owner | grep across `APP_STORE_METADATA.md` §7, `APP_STORE_SUBMISSION.md` §5, `APPLE_TESTFLIGHT_PREP.md` §4.3, this file (no conflicting `12+` claim) | [x] PASS — 2026-05-06 |
| URLs match the live Netlify host and the EAS env values | release owner | `APP_STORE_METADATA.md` §8 + `APPLE_TESTFLIGHT_PREP.md` §4.8 | [x] PASS — 2026-05-06 |
| Review notes walkthrough covers session proposal + Events | release owner | `APP_STORE_METADATA.md` §9 | [x] PASS — 2026-05-06 |
| `APP_STORE_SUBMISSION.md` defers to the metadata doc rather than carrying conflicting copy | release owner | submission doc §7 / §8 / §9 / §12 | [x] PASS — 2026-05-06 |
| Privacy label confirmed against actual SDK behaviour | operator | `APP_PRIVACY_LABEL_DRAFT.md` validated against shipped SDKs | [ ] PENDING |
| Reviewer demo account credentials available in App Store Connect (NEVER in repo) | operator | ASC App Review Information panel populated | [ ] PENDING |
| Final age-rating questionnaire completed in App Store Connect | operator | ASC age-rating result captured | [ ] PENDING |

The text content is finalized as far as the repo can take it. ASC
upload, the privacy nutrition label, and the reviewer demo account
remain Apple-side setup items tracked in §5 of this doc and §12 of
`APP_STORE_METADATA.md`.

---

## 5. Apple-Side Setup Required

Non-repo dependencies. These cannot be satisfied by merging code. Each line
states the stage it blocks.

| Requirement | Required by gate | Status |
|---|---|---|
| Apple Developer Program enrollment (Team ID captured) | Gate 2 | [x] PASS — 2026-05-07. Apple Team ID `37C8A2733Y` captured. |
| App Store Connect app record created (ASC App ID captured) | Gate 2 | [x] PASS — 2026-05-07. SportsGang app record created in App Store Connect; ASC App ID `6767027447` captured. |
| Bundle identifier consistency: `apps/mobile/app.config.js` vs ASC app record vs APNs capability | Gate 2 | [~] App ↔ ASC bundle consistency confirmed (`com.edh1223.protin` in both as of 2026-05-07). APNs capability on the bundle ID is still Apple-side setup required. |
| Signing credentials: EAS-managed or team-owned; confirmed on first `eas build` | Gate 2 | [ ] |
| Push entitlement / APNs capability enabled on the bundle ID | Gate 2 (push claim) and Gate 3 | [ ] |
| TestFlight internal tester group with 2 or more humans | Gate 2 | [ ] |
| TestFlight external review (if used) | Gate 3 | [ ] |
| Privacy Policy URL publicly hosted; URL in `apps/mobile/src/lib/legal.ts` updated to final | Gate 3 | [x] hosted at `https://sportgang.netlify.app/privacy/`; pinned via `EXPO_PUBLIC_PRIVACY_URL` on EAS preview + production. Constant-default swap in `apps/mobile/src/lib/legal.ts` is optional once the env-driven flow is shipped. |
| Support URL publicly hosted | Gate 3 | [x] hosted at `https://sportgang.netlify.app/support/`; pinned via `EXPO_PUBLIC_SUPPORT_URL` on EAS preview + production. |
| Reviewer demo account credentials seeded and captured | Gate 3 | [x] DB seed run against production on 2026-05-12 via `apps/api/scripts/seed_review_data.py`; reviewer email `review@sportsgang.app` and 5 demo candidates / 3 matches / 5 messages / 3 bookings verified live via public API. Password lives only in the Fly `REVIEWER_PASSWORD` secret — must still be pasted into the App Store Connect "App Review Information" → Password field at resubmission time. |
| App Review Contact Info (name, email, phone) finalized | Gate 3 | [ ] |
| Review notes block finalized (see `APP_STORE_SUBMISSION.md` section 7) | Gate 3 | [ ] |
| `apps/mobile/eas.json` `ascAppId` and `appleTeamId` filled (non-placeholder) | Gate 2 | [x] PASS — 2026-05-07. `ascAppId = "6767027447"`, `appleTeamId = "37C8A2733Y"` pinned in `apps/mobile/eas.json`. |

Do not treat any of these as "will-do" during a gate review. If the row is
unchecked at decision time, the gate does not pass.

---

## 6. Blocked or Risky

Concrete gaps right now. This section is where missing proof,
known-absent repo artifacts, and Apple-side unknowns live.

| Item | Why it blocks or creates risk | Affected gate | Owner | Resolution condition |
|---|---|---|---|---|
| `apps/mobile/assets/` directory does not exist | `app.config.js` references `./assets/notification-icon.png`; `eas build` fails on missing path. App icon, splash, and adaptive icon also not wired | Gate 2 | mobile | Assets committed and referenced in `app.config.js` |
| ~~`apps/api/scripts/seed_review_data.py` does not exist~~ | RESOLVED 2026-05-12 — script is committed, idempotent, and gated on `REVIEWER_EMAIL` / `REVIEWER_PASSWORD` Fly secrets. Seeded against production (`protin-api`) on 2026-05-12; verified via public API: `/auth/login` 200, `/discovery?sport=gym` returns 7 candidates including Chris/Kim/Luke/Taylor Kim/Sarah, `/matches` returns 3 (Chris/Kim/Sarah) with seeded message previews, `/bookings` returns 1 confirmed + 2 proposed sessions. Original cause of the April 2026 Apple Guideline 2.1(a) rejection ("No content loaded during review"). | Gate 3 | api | DONE |
| ~~`apps/mobile/eas.json` still contains `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` and `REPLACE_WITH_APPLE_TEAM_ID` placeholders~~ | RESOLVED 2026-05-07 — `ascAppId = "6767027447"` and `appleTeamId = "37C8A2733Y"` are pinned in `apps/mobile/eas.json` `submit.production.ios`. | Gate 2 | mobile / release owner | Real values in `eas.json` |
| Push end-to-end on real iPhone not yet proven | Code-and-config readiness is not APNs delivery; claiming push as ready is the single highest rejection risk | Gate 2 push claim, Gate 3 | mobile and api | Section 4.3 rows checked with dated evidence |
| Google Calendar flow not yet proven on real iPhone | Surface is exposed in booking UI; if unverified at Gate 3, hide or mark as optional | Gate 3 (risk) | mobile | Section 4.4 rows checked or feature hidden behind a flag |
| Legal URLs in `apps/mobile/src/lib/legal.ts` still point at unpublished paths | App Store requires reachable Privacy Policy URL; mismatch risks a 5.1.2 rejection | Gate 3 | release owner | RESOLVED 2026-05-05 — URLs hosted on Netlify (`https://sportgang.netlify.app/{privacy,terms,support}/`), pinned on EAS preview + production via `EXPO_PUBLIC_*_URL`, and tap-tested on real iPhone (section 4.6). Hardcoded fallback constants in `apps/mobile/src/lib/legal.ts` may still be swapped in a separate slice once the env-driven flow is the only path. |
| Public-facing brand spelling normalization to `SportsGang` / `sportsgang` | Operator decided 2026-05-05 to standardize on `SportsGang` (the inner `s` better implies multiple sports and future multi-sport expansion). On `release/v1` this commit normalized: visible mobile copy (`apps/mobile/src/screens/safety/ReportScreen.tsx` + matching test assertion), all release/deployment/legal docs, and the env-example comments. `apps/mobile/app.config.js` `expo.name` was already `SportsGang` and remains unchanged. Technical identifiers (slug `protin`, bundle ID `com.edh1223.protin`, npm workspaces `@protin/*`, EAS project `@edwardh1234/protin`) are intentionally preserved for v1. The Netlify deployment URL `https://sportgang.netlify.app/` is intentionally preserved (the public brand is `SportsGang` but the hostname stays). The website pages and README at `apps/web/site/` live on `feature/sportgang-official-website` (not on `release/v1`) and still need the same normalization on that branch | Gate 3 | release owner | RESOLVED on `release/v1` 2026-05-05 for the artifacts on this branch. Open: same normalization on `feature/sportgang-official-website` for the live website HTML/CSS, and an optional later swap of the Netlify hostname to a `sportsgang.*` custom domain |
| Delete-account not verified on real device | Core Apple 5.1.1(v) requirement; code-only is not proof | Gate 2 and Gate 3 | mobile and api | Section 4.2 rows checked |
| Reviewer-usable staging environment not confirmed live | Confirmed CONFIRMED-DOWN as of 2026-05-07: `curl https://protin-api.fly.dev/health` returns `Could not resolve host`. The Fly app `protin-api` has not been created yet (no `fly launch` run). All wiring is in place — `fly.toml` at the repo root, Dockerfile at `apps/api/Dockerfile`, deploy guide at `infra/fly/README.md` (corrected 2026-05-07 to fix the broken `FIELD_ENCRYPTION_KEY` generator command and add the `APP_ENV`, `INTERNAL_API_TOKEN`, `APPLE_CLIENT_ID`, and `POSTGRES_URL`-mirror secrets that were absent from the prior list) — but `eas.json` `EXPO_PUBLIC_API_URL=https://protin-api.fly.dev` will only resolve once the user runs the README's `fly launch` -> `fly postgres / redis create` -> `fly secrets set` -> `fly deploy` -> `fly ssh ... alembic upgrade head` flow. | Gate 1, Gate 2, Gate 3 | infra / release owner | Run `infra/fly/README.md` end-to-end, then capture `curl https://protin-api.fly.dev/health` → `200 ok` with `db: ok` and `redis: ok`, plus a reviewer account login probe |
| Real-device verification not performed | Sections 4.1 through 4.5 rows that require a real-iPhone run cannot be checked without one. The Current verification state summary in section 4 records what backend-only evidence exists today | Gate 2, Gate 3 | mobile + release owner | A dated device run per section 4 row, captured by owner |
| Two pre-existing backend test baseline failures | `apps/api/tests/test_auth.py::test_get_me_with_no_token_returns_401` asserts `== 403` but the stack returns `401` for missing credentials. `apps/api/tests/test_health.py::test_health_db_failure_does_not_crash` asserts `== 200` but `apps/api/app/main.py` returns `503` when any check is not `"ok"`. Both fail against current app behavior and keep the backend test suite off a clean-green baseline | Gate 1 (noise), Gate 3 (clean-suite evidence for review) | api | Fix each assertion to match current behavior in a separate slice, or adjust the production code if the intent is different |

### 6.2 Non-blocking follow-ups from 2026-05-06 device QA

These came out of the real-device QA pass for sections 4.7-4.10 and
are tracked here so they don't get lost. None of them block the gates
above; each is a polish or hygiene item to pick up in a separate slice.

| Item | Notes | Affected gate | Owner |
|---|---|---|---|
| Events Accept / Decline error body still surfaces raw `Error.message` on some failure paths | Alert title is the friendly `Couldn't update this session.` headline (S2), but the body falls through to `err.message` for some networking failures. Map to a friendly fallback in `apps/mobile/src/screens/events/EventsScreen.tsx` and `apps/mobile/src/screens/chat/ChatScreen.tsx` | Polish (none) | mobile |
| Events tab navigation tests do not assert exact tab order | `RootNavigator.test.tsx` mocks the tab navigator via a generic `Screen` stub; the four-tab order is enforced only by reading `RootNavigator.tsx`. Add a focused assertion that `Discovery → Matches → Events → Profile` is the registered order | Polish (none) | mobile |
| `apps/mobile/src/lib/sessions.ts` lacks direct unit tests | The helper is exercised indirectly via `EventsScreen.test.tsx` and `ProfileScreen.test.tsx`, but past / declined / cancelled / malformed payload filtering would benefit from a dedicated unit-test file | Polish (none) | mobile |
| ProfileScreen Upcoming-sessions tests still log React `act(...)` warnings | Tests pass but the focused fetch fires a state update outside an awaited `act` in some cases. Wrap the relevant `mockFetchProfile`/upcoming fetcher chains in `act` to silence | Polish (none) | mobile |
| Untracked `apps/web/claude_design/` and `findstr` debris in workspace | Local hygiene only — neither is staged in any commit on `release/v1`; they appear in `git status --short` and should either be committed to a branch or removed from the worktree | Polish (none) | release owner |

---

## 7. Release Gates

Three gates only. Each has an entry intent, a must-pass checklist, and
explicit no-go conditions. A gate passes only when **all** must-pass items
are checked and **none** of the no-go conditions are present.

### Gate 1 - Internal Beta

**Entry intent:** Protin team members can install or run the app (simulator
or TestFlight-internal) against a usable backend to exercise core auth,
profile, and discovery flows.

**Must-pass:**

- [ ] Core login (email/password) works against the deployed staging backend.
- [ ] Onboarding completes end-to-end on at least one real device run
  (section 4.5).
- [ ] Reviewer-usable staging confirmed: deploy script completes cleanly and
  `/health` is reachable over HTTPS from outside the host.
- [ ] At least one seed or demo account exists that a human can log into.
- [ ] No placeholder values in `.env.staging` for any service on the core
  path (API, DB, Redis, encryption key).
- [ ] Delete-account endpoint reachable (not necessarily verified end-to-end
  yet; see Gate 2).

**No-go conditions:**

- Staging backend is down, on localhost-only, or booted with placeholder
  secrets.
- Login cannot complete against the deployed backend.
- There is no working demo account a human can use.

Push and Google Calendar may be **partial** at this gate if they are
explicitly called non-core for the internal beta; they do not have to be
proven here, but claims about them must read as "not yet verified".

### Gate 2 - TestFlight

> For detailed Apple-side prep status that feeds into this gate, see
> `docs/archive/deployment/APPLE_TESTFLIGHT_PREP.md`.

**Entry intent:** A signed iOS build is in TestFlight, installable by real
testers, and core flows have been proven on a real iPhone against the
deployed backend.

**Must-pass:**

- [ ] Section 4.1 auth rows checked on a real iPhone.
- [ ] Section 4.2 delete-account rows checked on a real iPhone.
- [ ] Section 4.3 push rows: at minimum permission prompt, token
  registration, and one successful real-device delivery logged.
- [ ] Section 4.5 onboarding row checked on a real iPhone.
- [x] Apple Developer Program enrollment, App Store Connect app record,
  Team ID `37C8A2733Y`, and ASC App ID `6767027447` all captured 2026-05-07
  (section 5).
- [~] Bundle identifier matches across `app.config.js` (`com.edh1223.protin`)
  and the ASC app record (confirmed 2026-05-07). APNs capability on that
  bundle ID is still Apple-side setup required.
- [x] `apps/mobile/eas.json` `ascAppId = "6767027447"` and
  `appleTeamId = "37C8A2733Y"` (non-placeholder) — committed 2026-05-07.
- [ ] `apps/mobile/assets/` exists with the files referenced by
  `app.config.js` and by the first App Store visual pass.
- [ ] TestFlight internal tester group populated with 2 or more humans.
- [ ] Reviewer-usable staging (from Gate 1) is still live and healthy.

**No-go conditions:**

- Push is claimed ready without section 4.3 delivery evidence on a real
  iPhone.
- Delete-account is unverified on device.
- `eas build` cannot produce a green artifact.
- Any `REPLACE_WITH_*` placeholder remains in `eas.json`.
- APNs capability is not enabled for the bundle ID.

### Gate 3 - Submission Prep

> For detailed Apple-side prep status that feeds into this gate, see
> `docs/archive/deployment/APPLE_TESTFLIGHT_PREP.md`. For ASC metadata form values,
> see `docs/archive/deployment/APP_STORE_SUBMISSION.md`.

**Entry intent:** Every user-visible feature is either proven or hidden, App
Store Connect is complete, and a reviewer can get to the core loop with the
supplied demo account.

**Must-pass:**

- [ ] All of Gate 2 still true.
- [ ] Sections 4.1 through 4.5 rows fully checked with dated evidence,
  including Google Calendar (section 4.4) if the feature is exposed in the
  shipped UI; otherwise the feature is hidden behind a flag.
- [ ] Section 5 Apple-side setup entirely checked, including reviewer demo
  account, review notes block, support URL, privacy URL, contact info.
- [ ] Legal URLs in `apps/mobile/src/lib/legal.ts` are live and reachable.
- [ ] Reviewer demo account exercised end-to-end by a team member against
  the production build from TestFlight.
- [x] `apps/api/scripts/seed_review_data.py` exists, is documented, and has
  been executed against **production** on 2026-05-12 (Fly `protin-api`).
  Reviewer credentials live in the Fly `REVIEWER_EMAIL` / `REVIEWER_PASSWORD`
  secrets; verified end-to-end via public API (`/auth/login`, `/discovery`,
  `/matches`, `/bookings`). Re-running before each resubmission is idempotent
  and refreshes the booking start times forward.
- [ ] Section 6 has no rows flagged "affected gate: Gate 3" still open.

**No-go conditions:**

- Any user-visible feature remains unverified on a real device without being
  hidden or disclosed in review notes as limited.
- Delete-account not verified end-to-end on a real iPhone.
- Privacy Policy URL or Support URL unreachable.
- Any placeholder in `eas.json`, legal URLs, or reviewer notes.
- Demo account credentials not captured or not working.

---

## 8. Companion Docs

Short pointers only. Do not duplicate their content here.

- Apple / TestFlight preparation status (configured / blocked / Apple-side
  setup required / verify on real device, with next actions):
  `docs/archive/deployment/APPLE_TESTFLIGHT_PREP.md`.
- Release mechanics (Fly deploy, EAS build, TestFlight promotion, rollback):
  `docs/deployment/RELEASE_RUNBOOK.md`.
- App Store Connect field-by-field metadata, review notes template, and
  screenshot plan: `docs/archive/deployment/APP_STORE_SUBMISSION.md`.
- Staging operations, env vars, QA, and setup: `docs/archive/staging/RUNBOOK.md`,
  `docs/archive/staging/ENV_VARS.md`, `docs/archive/staging/QA_CHECKLIST.md`,
  `docs/archive/staging/SETUP.md`, `docs/archive/staging/KNOWN_ISSUES.md`.
- Legal source-of-truth: `docs/legal/PRIVACY_POLICY.md`,
  `docs/legal/TERMS_OF_SERVICE.md`.

---

## 9. Merge Acceptance Criteria

This document itself must satisfy the following before being treated as the
canonical gate artifact:

- One reader can decide **stop**, **continue verification**, or **advance to
  next gate** in a single pass, without opening any other doc.
- Every "Implemented in Repo" row cites evidence present in the current
  repo, paired with a "does not prove" line.
- Every "Needs Real-Device Verification" row has an owner and an explicit
  evidence field, not prose.
- Every "Apple-Side Setup Required" row states which gate it blocks.
- Every "Blocked or Risky" row names the affected gate and a concrete
  resolution condition.
- No gate section claims a feature is ready without a matching checked row
  in section 3 and section 4 (or section 5 where Apple-side).
- The doc does not repeat procedural content from `RELEASE_RUNBOOK.md` or
  `APP_STORE_SUBMISSION.md`.
- No aspirational items ("polish UX", "improve onboarding"): every line
  maps to a go/no-go decision.
- Text uses plain ASCII punctuation and plain-text checkboxes so the file
  renders consistently across terminals, editors, and git viewers.
