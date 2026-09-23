# Protin - Apple / TestFlight Preparation

Practical, conservative status artifact for moving Protin toward internal
TestFlight. Answers four operational questions at a glance:

- What is **configured** in the repo today?
- What is **blocked** (a concrete gap we can see right now)?
- What **Apple-side setup** is still required (external, not code)?
- What is waiting on **real-device** proof?

This document is scoped to Apple / TestFlight preparation. It does not
redesign strategy, rewrite App Store metadata, or make new feature claims.
Every "Next action" below is a pointer for a future slice, not a change this
document performs.

---

## 1. Purpose and Scope

This prep doc exists so one reader can decide, on one pass, whether the
project is ready to kick off an internal TestFlight build. It explicitly
does **not**:

- rewrite `APP_STORE_SUBMISSION.md` (the metadata / reviewer-notes artifact)
- rewrite `RELEASE_GATE_CHECKLIST.md` (the go/no-go gate artifact)
- act as release strategy or marketing copy
- produce App Store screenshots, keywords, or descriptions

The seven prep areas covered here are exactly:

1. iOS app identity and bundle consistency
2. EAS build, signing, and APNs path
3. App Store Connect app-record readiness
4. Privacy policy and support URL readiness
5. Reviewer notes, reviewer contact, and demo account path
6. TestFlight internal readiness
7. Explicit separation from still-missing real-device verification

---

## 2. How to Use This Prep Doc

Status vocabulary used throughout. Pick the one that honestly fits:

| Status                        | Meaning |
|---                            |---|
| configured                    | Already set in the repo or already configured on the Apple side. Cite evidence. |
| blocked                       | A concrete gap in the repo or on the Apple side that prevents this item from moving forward today. |
| Apple-side setup required     | Not satisfiable by code: requires Apple Developer / App Store Connect / APNs work. |
| verify on real device         | Code or config looks right, but a real-iPhone run is required before it can be claimed as working. |

If an item's status is unknown, treat it as `blocked` until someone captures
evidence. Do not use this doc to claim something is configured when the only
evidence is "it should be."

When recording future evidence, include a date and an owner. Evidence
without a date is not evidence.

---

## 3. Current Prep-Status Summary

Snapshot of where the seven areas stand right now, in plain present tense.

- **Bundle identity** is `com.edh1223.protin` in both `apps/mobile/app.config.js`
  (iOS) and the Android package field. Same identifier is assumed by
  `APP_STORE_SUBMISSION.md`. It is `configured` in the repo; the matching
  App Store Connect app record and APNs capability on that bundle ID remain
  `Apple-side setup required`.
- **EAS build path** has three profiles (development, preview, production).
  Production targets `https://protin-api.fly.dev` and `autoIncrement: true`.
  The `submit.production.ios` block carries the real `ascAppId`
  (`6767027447`) and `appleTeamId` (`37C8A2733Y`) as of 2026-05-07.
  Signing credentials and APNs entitlement remain `Apple-side setup
  required` (exercised on the first `eas build`).
- **App Store Connect app record** is `configured`. The `SportsGang`
  app record was created 2026-05-07; the ASC App ID `6767027447` is
  pinned in `apps/mobile/eas.json`. `APP_STORE_SUBMISSION.md` section 1
  captures the one-time setup that produced it.
- **Privacy policy / support URLs** are `hosted and EAS-pinned`. The
  static site at `apps/web/site/` is deployed to Netlify and all four
  canonical routes resolve over HTTPS today:
  - `https://sportgang.netlify.app/`
  - `https://sportgang.netlify.app/privacy/`
  - `https://sportgang.netlify.app/terms/`
  - `https://sportgang.netlify.app/support/`
  The sources at `docs/legal/PRIVACY_POLICY.md` and
  `docs/legal/TERMS_OF_SERVICE.md` remain the markdown reference. The
  `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, and
  `EXPO_PUBLIC_SUPPORT_URL` env vars are documented in
  `apps/mobile/.env.example`, `apps/mobile/.env.staging.example`, and
  `.env.example` so local Expo runs resolve them, and have been **applied
  on the EAS `preview` and `production` environments** — verifiable with
  `eas env:list --environment {preview,production}`. The only remaining
  legal-link verification step is a dated real-device tap-through (see
  §4.4 and §4.8).
- **Reviewer notes / contact / demo account** — the seeded review account
  side is `configured` as of 2026-05-12: `apps/api/scripts/seed_review_data.py`
  is committed, has been run against production (`protin-api`), and the
  reviewer login + 5 demo discovery candidates + 3 matches + chat history +
  3 bookings are live and verified via the public API. The reviewer notes
  template still lives in `APP_STORE_SUBMISSION.md` section 7. What
  remains is operator-side: paste the `REVIEWER_PASSWORD` from the Fly
  secret into the App Store Connect "App Review Information" panel at
  resubmission time.
- **TestFlight internal readiness** is `blocked` on two of: `eas.json`
  placeholders and the reviewer demo account path. `apps/mobile/assets/`
  now contains placeholder `icon.png`, `splash.png`, and
  `notification-icon.png` so config evaluation no longer fails on missing
  files. Final App Store artwork must replace these placeholders before
  public submission.
- **Real-device verification** is `verify on real device` across the five
  priority areas listed in `RELEASE_GATE_CHECKLIST.md` section 4. No
  real-iPhone run has been recorded.

Detailed area-by-area tables follow.

---

## 4. Area-by-Area Status

### 4.1 iOS app identity / bundle consistency

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| iOS `bundleIdentifier` | configured | `apps/mobile/app.config.js:49` -> `ios.bundleIdentifier = "com.edh1223.protin"` | Use this exact string when creating the App Store Connect app record. |
| Android `package` matches | configured | `apps/mobile/app.config.js:61` -> `android.package = "com.edh1223.protin"` | None. |
| App name / slug / version | configured | `app.config.js` -> `name: "Protin"`, `slug: "protin"`, `version: "1.0.0"`, `ios.buildNumber: "1"` | Bump `version` only for user-visible release; `autoIncrement` handles build number on production profile. |
| ASC app record uses same bundle | configured | App Store Connect app record created 2026-05-07 with public name `SportsGang`, Bundle ID `com.edh1223.protin`. ASC App ID `6767027447` captured. | None. |
| APNs capability enabled on the bundle ID | Apple-side setup required | Not verifiable from the repo | Enable "Push Notifications" on the bundle ID in the Apple Developer portal once the app record exists. |

### 4.2 EAS build / signing / APNs path

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| EAS production profile | configured | `apps/mobile/eas.json` -> `build.production` sets `autoIncrement: true` and `EXPO_PUBLIC_API_URL = https://protin-api.fly.dev` | None. |
| EAS preview profile | configured | `eas.json` -> `build.preview` uses internal distribution against `https://protin-api.fly.dev` | None. |
| HTTPS API URL enforcement | configured | `app.config.js` `resolveApiUrl()` throws at config-eval when `APP_ENV=production` and the URL is missing / not `https://` | None. |
| Expo notifications plugin | configured | `app.config.js` declares `expo-notifications` with an icon + color | Icon path depends on `apps/mobile/assets/notification-icon.png` (see 4.6 blockers). |
| iOS `UIBackgroundModes` for push | configured | `app.config.js:57` -> `infoPlist.UIBackgroundModes = ["remote-notification"]` | None until APNs entitlement lands. |
| Signing credentials | Apple-side setup required | Apple Team ID `37C8A2733Y` captured 2026-05-07 and pinned in `eas.json` `submit.production.ios.appleTeamId`. EAS-managed credentials flow has not yet been exercised. | On first `eas build --platform ios --profile production`, accept the EAS-managed credentials flow (or upload a team-owned cert). |
| `ascAppId` in `eas.json` | configured | `apps/mobile/eas.json` `submit.production.ios.ascAppId` is `"6767027447"` (committed 2026-05-07). | None. |
| `appleTeamId` in `eas.json` | configured | `apps/mobile/eas.json` `submit.production.ios.appleTeamId` is `"37C8A2733Y"` (committed 2026-05-07). | None. |
| APNs delivery to a real iPhone | verify on real device | Backend notification path is covered by tests; APNs is not | After the bundle-ID APNs capability is enabled and an EAS build is installed on a device, exercise `POST /notifications/token` then trigger a send and confirm arrival. |

### 4.3 App Store Connect app-record readiness

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| Apple Developer Program enrolled | configured | Enrollment complete; Apple Team ID `37C8A2733Y` captured 2026-05-07 and pinned in `apps/mobile/eas.json`. | None. |
| ASC app record created | configured | App Store Connect app record created 2026-05-07 — public name `SportsGang`, Platform `iOS`, Primary language `English (Australia)`, Bundle ID `com.edh1223.protin`. See `APP_STORE_SUBMISSION.md` section 1. | None. |
| ASC App ID captured | configured | ASC App ID `6767027447` pinned in `apps/mobile/eas.json` `submit.production.ios.ascAppId`. | `eas submit --platform ios --latest` is unblocked once the first production build artifact exists. |
| App Privacy questionnaire answered | Apple-side setup required | `APP_STORE_SUBMISSION.md` section 4 holds the intended answers | Enter the answers exactly as documented; if Sentry DSN is not shipped, switch the two Sentry rows to `No`. |
| Age rating questionnaire | Apple-side setup required | Template in `APP_STORE_SUBMISSION.md` section 5 + recommended target in `APP_STORE_METADATA.md` §7 | Recommended conservative age-rating target: 17+ due to user profiles, chat, and real-world sports session coordination. Final rating must be confirmed in App Store Connect's age-rating questionnaire — Apple has not assigned any rating yet. |

### 4.4 Privacy policy / support URL readiness

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| Privacy policy source in repo | configured | `docs/legal/PRIVACY_POLICY.md` | None. |
| Terms of service source in repo | configured | `docs/legal/TERMS_OF_SERVICE.md` | None. |
| Static site published | configured | `apps/web/site/` deployed to Netlify; canonical host `https://sportgang.netlify.app/`. Routes `/`, `/privacy/`, `/terms/`, `/support/` all serve `200 OK` HTML over HTTPS. | None for the Netlify deployment. **Open:** swap to a final custom domain if/when the operator pins one. |
| Privacy Policy public URL | configured | Live at `https://sportgang.netlify.app/privacy/` | Pin into `EXPO_PUBLIC_PRIVACY_URL` on EAS production + preview (commands in §4.8). |
| Terms public URL | configured | Live at `https://sportgang.netlify.app/terms/` | Pin into `EXPO_PUBLIC_TERMS_URL` on EAS production + preview. |
| Support URL | configured | Live at `https://sportgang.netlify.app/support/` | Pin into `EXPO_PUBLIC_SUPPORT_URL` on EAS production + preview. Same address must align with the App Store Connect "App Review Contact" form once a real `support@` mailbox exists. |
| URLs reachable from outside the build environment | configured | Confirmed live by the operator after Netlify deploy. | Re-verify with the §4.8 checklist after any custom-domain switch. |
| Env example files document the values | configured | `apps/mobile/.env.example`, `apps/mobile/.env.staging.example`, and `.env.example` all carry the three `EXPO_PUBLIC_*_URL` values pointing at the Netlify host. | None. Update together with §4.8 commands if the host changes. |
| EAS env values pinned (preview + production) | configured | `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_URL` set on both `preview` and `production` environments via `eas env:create`. Verify with `eas env:list --environment {preview,production}`. | Re-apply with `eas env:update` if the host changes (e.g. custom-domain swap). |
| Real-device tap-through of all three in-app legal links | verified | 2026-05-05 — operator-confirmed PASS on iPhone via Expo Go / local development run: Privacy → `/privacy/`, Terms → `/terms/`, Support → `/support/` all opened on `https://sportgang.netlify.app/`. No "link unavailable" alert, no 404, no crash. Recorded in `docs/archive/deployment/RELEASE_GATE_CHECKLIST.md` §4.6. | Re-run after the first preview/TestFlight on-device install and after any Netlify host change (custom-domain swap). |

### 4.5 Reviewer notes / contact / demo account path

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| Review notes block | configured | Template verbatim in `APP_STORE_SUBMISSION.md` section 7 | Fill in real email, phone, and the seeded credentials at submission time. |
| Reviewer demo account | configured | 2026-05-12 — `apps/api/scripts/seed_review_data.py` committed and run against production `protin-api`. Reviewer login `review@sportsgang.app` is live, with 5 demo discovery candidates (Chris/Kim/Luke/Taylor Kim/Sarah), 3 mutual matches, 5 seeded messages, and 3 bookings (1 confirmed + 1 incoming proposal + 1 outgoing proposal). All endpoints verified via the public HTTPS API. Reason this matters: the April 2026 Apple Guideline 2.1(a) rejection ("No content loaded during review") was caused by the reviewer landing on an empty Discover feed. | Paste the Fly-secret `REVIEWER_PASSWORD` into the App Store Connect "App Review Information" → Password field at resubmission time. Re-run the seed before each resubmission so booking dates remain future-facing. |
| Required review test data (demo partners + pending booking + chat history) | configured | 2026-05-12 — seeded via `seed_review_data.py`; final shape exceeds the original two-partner minimum (5 demo partners under Gym, 3 mutual matches, 2 seeded chats, 3 bookings spanning incoming pending, outgoing pending, and confirmed upcoming). Seed shape documented in `APP_STORE_SUBMISSION.md` §6. | Re-run before each resubmission to roll booking start times forward. |
| Reviewer contact info | Apple-side setup required | Not in repo | Capture real name + email + phone for the ASC App Review Contact form. |
| Sign in with Apple path for reviewers | configured (but not verified on device) | Backend `POST /auth/apple` + mobile `LoginScreen.tsx` button, iOS-gated, plus `APPLE_CLIENT_ID` documented in `.env.staging.example` | Set `APPLE_CLIENT_ID = com.edh1223.protin` on the deployed backend; then `verify on real device`. |

### 4.6 TestFlight internal readiness

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| `apps/mobile/assets/` directory | configured (placeholder) | Directory exists with placeholder `icon.png` (1024x1024), `splash.png`, and `notification-icon.png`. `app.config.js` wires `icon` + `splash.image`. Android `adaptiveIcon.foregroundImage` is intentionally not wired yet — Expo falls back to `icon` for the adaptive icon, which is acceptable for internal TestFlight | Replace placeholder PNGs with final App Store artwork (see §6.1) and wire `android.adaptiveIcon.foregroundImage` before public submission. |
| Production API URL available over HTTPS | blocked | `eas.json` production profile points at `https://protin-api.fly.dev`. Confirmed CONFIRMED-DOWN 2026-05-07 — `curl https://protin-api.fly.dev/health` returns `Could not resolve host`; no Fly app exists yet. `fly.toml`, `apps/api/Dockerfile`, and `infra/fly/README.md` (corrected 2026-05-07) are in place, so the deploy is a one-time setup the operator must run. | Run the `infra/fly/README.md` flow (`fly launch` -> `fly postgres create / attach` -> `fly redis create` -> `fly secrets set` (incl. mirroring `DATABASE_URL` into `POSTGRES_URL`, plus `APP_ENV`, `SECRET_KEY`, `FIELD_ENCRYPTION_KEY` (Fernet), `INTERNAL_API_TOKEN`, `APPLE_CLIENT_ID`) -> `fly deploy` -> `fly ssh ... alembic upgrade head`), then verify `curl https://protin-api.fly.dev/health` returns `"status": "ok"` with `db: ok` + `redis: ok`. |
| `eas build --platform ios --profile production` produces a green IPA | blocked | Missing assets + placeholders make the first build predictably fail | Land assets, fill `eas.json` identifiers, then run the build. |
| `eas submit --platform ios --latest` | blocked | Depends on the green build + real ASC/Team IDs | Run after the build, gated by the Apple-side setup rows above. |
| TestFlight internal tester group | Apple-side setup required | No group exists yet | In App Store Connect -> TestFlight -> Internal Testing, add at least 2 humans to an internal group and associate the build. |
| At least one dated internal tester run on device | verify on real device | No dated run recorded | Have an internal tester install via TestFlight and exercise the core flow end to end; capture the date and any blockers. |

### 4.7 Explicit separation from still-missing real-device verification

Items in this table are **not** Apple-side setup. They only move forward once
the build is on a real iPhone and exercised. Apple-side items in 4.1-4.6
above can in principle be prepared in parallel.

| Device check | Status | Depends on |
|---|---|---|
| Email / password register, logout, re-login on real iPhone | verify on real device | Deployed backend + TestFlight build |
| Session restore across app kill and relaunch | verify on real device | Same |
| Sign in with Apple against live backend | verify on real device | Backend has `APPLE_CLIENT_ID` set + TestFlight build |
| Delete-account full flow on device | verify on real device | TestFlight build |
| Push permission prompt | verify on real device | EAS build + APNs capability enabled |
| Expo push token registered via `POST /notifications/token` | verify on real device | Same |
| Backend-triggered push arrives on device | verify on real device | Same + backend can reach Expo push service |
| Tap on push opens the intended screen | verify on real device | Same |
| Calendar permission prompt and add-to-calendar flow | verify on real device | TestFlight build |
| Onboarding end-to-end on real iPhone | verify on real device | TestFlight build |

None of these can be `configured`. Each needs a dated run, an owner, and a
pass / fail note in `RELEASE_GATE_CHECKLIST.md` section 4 before the matching
Apple / TestFlight gate passes.

A second batch of device runs HAS been recorded for the chat ownership
fix, account-switching-for-chat, session proposal cards, Accept /
Decline, and the Events tab. Those are tracked under
`RELEASE_GATE_CHECKLIST.md` sections 4.7-4.10 with dated 2026-05-06
evidence. Calendar weekday alignment ships with unit + component
coverage but the on-device visual recheck remains pending in section
4.10.

---

### 4.8 Legal/support URL verification

The static legal/marketing site is deployed to Netlify at
`https://sportgang.netlify.app/`. Run this checklist any time the host
changes (custom-domain swap), the `apps/web/site/` content is re-deployed,
or before submitting a new TestFlight build that depends on the in-app
legal links.

Canonical URLs to verify:

- `https://sportgang.netlify.app/`
- `https://sportgang.netlify.app/privacy/`
- `https://sportgang.netlify.app/terms/`
- `https://sportgang.netlify.app/support/`

These are public URLs and safe to log/document. They are **not** secrets.

#### Web reachability

- [ ] Open `https://sportgang.netlify.app/` in a desktop browser; page
      loads, `200 OK`, no console errors.
- [ ] Open `https://sportgang.netlify.app/privacy/`; page renders the
      Privacy Policy.
- [ ] Open `https://sportgang.netlify.app/terms/`; page renders the
      Terms of Service.
- [ ] Open `https://sportgang.netlify.app/support/`; page renders the
      Support / contact page.

#### Local Expo link-tap test

- [ ] Make sure `apps/mobile/.env` carries the three legal URL values
      (copy from `apps/mobile/.env.example` if needed):
      ```
      EXPO_PUBLIC_PRIVACY_URL=https://sportgang.netlify.app/privacy/
      EXPO_PUBLIC_TERMS_URL=https://sportgang.netlify.app/terms/
      EXPO_PUBLIC_SUPPORT_URL=https://sportgang.netlify.app/support/
      ```
- [ ] Restart Expo with cache clear if the variables changed:
      `npx expo start --clear` from `apps/mobile/`.
- [ ] Open the app in Expo Go or a local development build.
- [ ] Tap each of these and confirm the URL opens (system browser or
      in-app browser, depending on platform):
      - Auth/Register screen — Privacy link
      - Auth/Register screen — Terms link
      - Profile / Settings — Privacy link
      - Profile / Settings — Terms link
      - Profile / Settings — Support link
- [ ] Confirm for each link:
      - The expected `https://sportgang.netlify.app/{privacy,terms,support}/`
        URL opens.
      - No "link unavailable" / disabled-affordance alert appears.
      - No 404 on the loaded page.
      - The app does not crash when returning from the browser.

#### EAS env wiring

**Status: applied.** All three `EXPO_PUBLIC_*_URL` values are set on the
EAS `preview` and `production` environments. Verify any time with:

```
eas env:list --environment preview
eas env:list --environment production
```

Each should show:

```
EXPO_PUBLIC_PRIVACY_URL=https://sportgang.netlify.app/privacy/
EXPO_PUBLIC_SUPPORT_URL=https://sportgang.netlify.app/support/
EXPO_PUBLIC_TERMS_URL=https://sportgang.netlify.app/terms/
```

If a value is missing or wrong (e.g. after a custom-domain swap), use
`eas env:update` rather than `:create` to avoid duplicates. Source
commands originally used to create:

```
# Preview (internal-distribution / TestFlight internal)
eas env:create --environment preview --name EXPO_PUBLIC_PRIVACY_URL --value https://sportgang.netlify.app/privacy/ --type string --visibility plaintext --non-interactive
eas env:create --environment preview --name EXPO_PUBLIC_TERMS_URL   --value https://sportgang.netlify.app/terms/   --type string --visibility plaintext --non-interactive
eas env:create --environment preview --name EXPO_PUBLIC_SUPPORT_URL --value https://sportgang.netlify.app/support/ --type string --visibility plaintext --non-interactive

# Production (App Store)
eas env:create --environment production --name EXPO_PUBLIC_PRIVACY_URL --value https://sportgang.netlify.app/privacy/ --type string --visibility plaintext --non-interactive
eas env:create --environment production --name EXPO_PUBLIC_TERMS_URL   --value https://sportgang.netlify.app/terms/   --type string --visibility plaintext --non-interactive
eas env:create --environment production --name EXPO_PUBLIC_SUPPORT_URL --value https://sportgang.netlify.app/support/ --type string --visibility plaintext --non-interactive
```

- [x] `eas env:list --environment preview` shows all three values pointing
      at the Netlify URLs.
- [x] `eas env:list --environment production` shows all three values
      pointing at the Netlify URLs.

#### Failure triage

If the local Expo or on-device link tap doesn't open the expected page:

- **"Link unavailable" alert appears.** The corresponding `EXPO_PUBLIC_*_URL`
  is unset or empty. Check `apps/mobile/.env` (local) or
  `eas env:list --environment <env>` (preview/production) and confirm all
  three variables exist with the Netlify URLs above.
- **Old / stale URL opens.** Expo's bundler is serving a cached env. Stop
  Expo and restart with cache clear:
  `npx expo start --clear` from `apps/mobile/`. For an on-device EAS build,
  rebuild — env vars are baked at build time.
- **404 page opens.** The Netlify deployment is missing a route, or a
  custom-domain swap was done without redeploying. Re-verify each route
  with `curl -I https://sportgang.netlify.app/{,privacy,terms,support}/`
  and re-deploy from `apps/web/site/` if needed.
- **`Linking.openURL` fails / nothing happens.** The device has no network,
  or the URL scheme isn't `https://`. Confirm the device has internet,
  then confirm each env var starts with `https://` (no missing protocol).
- **In-app browser opens but content fails to load.** Same network checks
  apply. Try the URL in the device's system browser to isolate whether the
  in-app browser or the network is at fault.

#### After a custom-domain swap

#### After a custom-domain swap

If the operator later pins a custom domain (e.g. `https://sportsgang.app/`
— hypothetical, not yet registered; do not claim either `sportsgang.app`
or `sportgang.app` is live until it actually is),
update the URL list at the top of this checklist, the env example files
(`apps/mobile/.env.example`, `apps/mobile/.env.staging.example`,
`.env.example`), `docs/archive/release/APP_STORE_METADATA.md` §8, the EAS env
values via `eas env:update`, and re-run this entire checklist.

### 4.9 Final local iOS screenshot package

The six final iOS screenshots for the v1 App Store carousel are
prepared locally at `docs/release/screenshots/ios/` (filenames `01-`
through `08-`; see `APP_STORE_METADATA.md` §11 for the order, surface
each image shows, and the v1-safe capture guidance). This is **local
preparation only** — the package has not been uploaded to App Store
Connect, no per-device-class resolution variants have been generated,
and no signed TestFlight build has been cut from these images. The
upload step is tracked under
`RELEASE_GATE_CHECKLIST.md` §4.11 (last two rows still PENDING) and
under §12 Remaining item 4 of `APP_STORE_METADATA.md`.

---

## 5. Immediate Blockers Before Internal TestFlight

An internal TestFlight build is not producible today. The minimum set of
blockers to clear, in dependency order:

1. **`apps/mobile/assets/` populated.** Done with placeholder PNGs
   (`icon.png` 1024x1024, `splash.png`, `notification-icon.png`) and
   `app.config.js` now wires `icon` and `splash.image`. Final App Store
   artwork must replace these placeholders before public submission.
   Android `adaptiveIcon.foregroundImage` is still TODO; the fallback to
   `icon` is acceptable for internal TestFlight.
2. **Apple Developer Program enrollment.** ✅ Complete (2026-05-07).
   Apple Team ID `37C8A2733Y` captured.
3. **ASC app record created with `com.edh1223.protin`.** ✅ Complete
   (2026-05-07). Public name `SportsGang`, ASC App ID `6767027447`. Both
   `ascAppId` and `appleTeamId` are pinned in `apps/mobile/eas.json`
   `submit.production.ios`.
4. **APNs capability enabled on the bundle ID.** Without this, any claim
   of push readiness is unsupportable.
5. **Signing credentials accepted on first `eas build`.** EAS-managed is
   the default; a team-owned certificate is acceptable.
6. **First green `eas build --platform ios --profile production`.**
7. **Upload via `eas submit --platform ios --latest`.**
8. **TestFlight internal tester group with at least 2 humans** associated
   with that build.

Items 1, the (now-resolved) `eas.json` ID swap, and the `APPLE_CLIENT_ID`
on the deployed backend are the things a contributor can resolve inside
the repo or its immediate config surface. Items 4, 5, 6, 7, and 8 are
Apple-side / build-side and remain open.

Gate 3 (submission prep) additionally requires the privacy/terms/support
URLs and the reviewer demo account path from sections 4.4 and 4.5.

---

## 6. Waiting on Real-Device Verification

These do not block internal TestFlight setup, but they block claims of
readiness. The full list lives in `RELEASE_GATE_CHECKLIST.md` section 4
(subsections 4.1 through 4.5). Summary pointer:

- Auth lifecycle on real iPhone (email+password, Apple sign-in, session
  restore, re-login, logout).
- Delete-account end-to-end on device and post-delete state.
- Push: permission prompt, token registration via `POST /notifications/token`,
  backend-triggered delivery, tap routing, denial path.
- Google Calendar: permission prompt, event landing on device calendar,
  denial-path non-regression.
- Onboarding: full three-step flow + cold-start land on Discovery feed.

Until each row has a dated device run, the matching `verify on real device`
entries in sections 4.1-4.6 above do not flip to `configured`.

---

## 6.1 Placeholder asset replacement before public submission

`apps/mobile/assets/icon.png`, `apps/mobile/assets/splash.png`, and
`apps/mobile/assets/notification-icon.png` are placeholder PNGs generated
for internal config validation. They are intentionally minimal (lime
brand background + dark "SG" wordmark) and are **not** the final
App Store artwork. Before public submission:

- Replace `assets/icon.png` with a final 1024x1024 RGB PNG (no
  transparency, no rounded corners — Apple applies the iOS mask).
- Replace `assets/splash.png` with the final centered splash artwork.
  Keep the surrounding canvas the brand lime (`#C6FF3D`) so it tiles
  seamlessly with the native splash background.
- Replace `assets/notification-icon.png` with the final monochrome
  notification icon (white silhouette on transparent — Android tints
  it with the notification accent color).
- Add `android.adaptiveIcon.foregroundImage` once the Android adaptive
  icon foreground is finalized.

App Store / Apple Team ID values are now real. As of 2026-05-07,
`eas.json` `submit.production.ios.ascAppId` is `"6767027447"` and
`appleTeamId` is `"37C8A2733Y"`; the `REPLACE_WITH_*` placeholders are
gone. `eas submit --platform ios --latest` is unblocked once the first
production build artifact exists.

No fake Firebase credential files were introduced. `app.config.js`
already gates `googleServicesFile` resolution behind `isStrictBuild()`
so a missing `google-services.json` / `GoogleService-Info.plist` does
not break local config evaluation; it only throws on
`APP_ENV=staging|production` or `EAS_BUILD_PROFILE=preview|production`.

---

## 7. Relationship to Companion Docs

Short pointers only. Do not duplicate content from these here.

- `docs/archive/deployment/APP_STORE_SUBMISSION.md` - field-by-field ASC metadata,
  the reviewer notes template, and the screenshot plan. This prep doc does
  not rewrite any of that; if the current submission doc has conflicting
  details about assets, seed script, or placeholder identifiers, treat this
  prep doc as the current source of truth for prep status and update the
  submission doc in a separate slice.
- `docs/archive/deployment/RELEASE_GATE_CHECKLIST.md` - the go/no-go artifact.
  Section 4 tracks device verification; section 5 tracks Apple-side setup;
  section 6 tracks blockers. This prep doc does not duplicate that tracking;
  it provides a more detailed, prep-focused view of the same items that
  maps directly to `configured | blocked | Apple-side setup required |
  verify on real device` so a contributor can act on them this week.
- `docs/deployment/RELEASE_RUNBOOK.md` - the build and submit mechanics.
  Use it when running the actual `fly deploy`, `eas build`, and `eas submit`
  commands once the blockers above are cleared.
- `docs/legal/PRIVACY_POLICY.md`, `docs/legal/TERMS_OF_SERVICE.md` -
  source-of-truth markdown for the legal pages that still need a public URL.
