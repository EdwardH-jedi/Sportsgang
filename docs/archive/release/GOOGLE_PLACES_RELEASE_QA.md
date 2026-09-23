# Google Places — v1.1 Release / Privacy QA

> **Scope:** engineering / release QA only. Nothing in this document is legal
> advice. App-store / privacy-policy decisions need product + legal sign-off
> before submission.

**Branch reviewed:** `feature/google-places-release-qa`
**Date:** 2026-05-16
**Reviewer:** harness QA pass
**Target release:** v1.1 (venue discovery — Google Places overlay)

---

## 1. Overview

v1.1 adds a Google Places (New) backend overlay on top of the existing
Sydney seed venue catalog. The mobile venue picker now:

- requests foreground location once per picker session (`useVenueLocation`
  — `expo-location` at `Accuracy.Balanced`),
- when coordinates resolve, requests `/venues/nearby?source=both`,
- otherwise (denied / unavailable / no permission yet) keeps the v1.0
  pure-catalog behaviour via `source=seed`,
- renders a "Powered by Google" attribution chip whenever any returned
  venue carries `source: "google_places"` (or `attributionRequired: true`).

Google API access is **backend-only**. The mobile bundle never receives,
references, or transmits the Places key.

---

## 2. Integration summary

| Concern | Where it lives | Evidence |
|---|---|---|
| Provider | `apps/api/app/services/places.py` | One async entry point `search_sport_places`; fails closed on every error path |
| Provider config | `apps/api/app/core/config.py:58` | `google_places_api_key: str = ""` — empty default ⇒ provider returns `[]` without HTTP |
| Service merge | `apps/api/app/services/venues.py:139-285` | Seed-first then Places, deduped by normalised name + 100m proximity; hard radius enforcement at boundary (`venues.py:257`) |
| Route | `apps/api/app/routers/venues.py:14-46` | `source: Literal["seed","places","both"]`; default `seed` keeps v1.0 wire shape |
| Schema | `apps/api/app/schemas/venues.py:42-51` | Additive `source`, `provider_place_id`, `attribution_required` — defaults match v1.0 seed-only behaviour |
| Mobile hook | `apps/mobile/src/hooks/useNearbyVenues.ts:30-46` | Passes `source` through; never references any Google key |
| Mobile UI | `apps/mobile/src/screens/bookings/NearbyCourtsModal.tsx:122,136-138,411-418` | `sourceMode = hasCoords ? "both" : "seed"`; attribution chip gated on Places-sourced rows |
| Shared types | `packages/shared-types/src/venue.ts:19,44-56,68` | `VenueSourceTag`, `VenueSourceMode`, optional v1.1 fields |

### Cost / data-shape guardrails

- Field mask pinned at `places.id, displayName, location, formattedAddress,
  shortFormattedAddress, types` (`places.py:54-63`). Heavy SKU fields
  (`regularOpeningHours`, `photos`, `userRatingCount`, `reviews`,
  `priceLevel`) are tested-to-be-absent (`test_places.py:276-283`).
- `maxResultCount` clamped to Places' API maximum of 20 (`places.py:73`).
- Radius clamped to Places' 50,000 m ceiling and re-enforced post-response
  via Haversine (`venues.py:248-258`) so a Places `locationBias`
  near-miss never breaks the `/venues/nearby` "within radius_km" contract.
- 24h in-process TTL cache, FIFO bounded at 256 entries, keyed on
  `(sport, lat:2dp, lng:2dp, radius_km:1dp)` — two QA testers half a
  block apart hit the same cache row (`places.py:123-169`).
- Places rows are **not persisted**. The `places_service.PlaceResult`
  dataclass is the only shape that crosses the provider boundary; raw
  Google JSON does not escape `_normalize_places_payload`
  (`places.py:299-339`).

---

## 3. Environment / secrets checklist

**Backend (Fly.io production / staging):**

- [ ] `GOOGLE_PLACES_API_KEY` set as a Fly secret on `protin-api`
      (currently **not** listed in the `fly secrets set` line at
      `docs/deployment/RELEASE_RUNBOOK.md:26-27` — the runbook owner
      should patch that command before v1.1 deploy).
- [ ] Key restricted in Google Cloud Console to **Places API (New)** only.
- [ ] HTTP referrer / IP restrictions reviewed (server-to-server, so
      restrict by IP or leave unrestricted with API-scope restriction).
- [ ] Verify nothing returns the key to clients — `app/services/places.py`
      is the only file that reads `settings.google_places_api_key`.

**Local dev / CI / App Store reviewer environment:**

- `apps/api/.env.example:39-45` documents the variable as empty default.
- Empty key short-circuits before any HTTP call
  (`places.py:204-205`) and before the cache lookup
  (`test_places.py:127-151`).
- Local `make run` works with `GOOGLE_PLACES_API_KEY=`; the picker falls
  back to seed-only and the attribution chip stays hidden.
- App Store reviewer build: leave the variable unset on the reviewer
  environment to keep reviewer flows deterministic. v1.1 reviewer seed
  is unchanged.

**Secrets-leak checks performed (no values printed):**

- [x] No `AIza`-prefixed values in any tracked file
      (`.env.example`, `apps/api/.env.example`, `apps/mobile/.env.example`,
      `apps/mobile/.env.staging.example`).
- [x] `apps/api/.env` and `apps/mobile/.env` are `.gitignore`-ed
      (`git check-ignore` confirms).
- [x] `git log --all --full-history -- '**/.env'` finds no commit
      adding a `.env` file.
- [x] Mobile bundle never references `GOOGLE_PLACES_API_KEY`,
      `googleapis.com`, `places.googleapis.com`, or `X-Goog-Api-Key`
      (grep over `apps/mobile/src` — only `'google_places'` string
      literals as a `source` discriminator).

---

## 4. App Privacy checklist

> Engineering / release QA only — not legal advice. Each row below is a
> verification item for product / legal before App Store Connect
> submission of v1.1.

**v1.0 baseline (existing app):**

- `docs/archive/release/APP_PRIVACY_LABEL_DRAFT.md` declares: no automatic
  precise location, no Google Places. Privacy policy mirrors this.

**v1.1 changes that affect this baseline:**

1. **Foreground precise location is now collected.** `useVenueLocation`
   (`apps/mobile/src/hooks/useVenueLocation.ts:64-92`) calls
   `Location.requestForegroundPermissionsAsync` and
   `Location.getCurrentPositionAsync({ accuracy: Balanced })`. The fix is
   used purely to populate the `lat` / `lng` query params on
   `GET /venues/nearby`. Not stored on device beyond the picker session.
2. **Location is sent to the backend.** Query string only; no body, no
   persisted server record. Server access logs may capture the URL path
   + query — that is in scope for the existing Fly.io access-log entry
   in the privacy policy (§4) and should be re-read to make sure
   "lat/lng in query string" is covered.
3. **Backend forwards coordinates to Google Places.** When
   `source=both` or `source=places` and the API key is set, the backend
   sends `latitude`, `longitude`, and a circular radius to
   `places.googleapis.com`. No user identifier is sent — the request
   carries only the sport keyword and the coordinates. (No user ID, no
   IP forwarding beyond what Google sees as the originating server.)
4. **Google Places becomes a third-party processor.** Today's processor
   table in the privacy policy (§4) and the App Privacy Label Draft (§6)
   does **not** list Google Places.

**Open question to flag for legal (do not answer here):**
Apple's App Privacy questionnaire asks about data collection by linked
SDKs and by the operator. When the operator's backend forwards a query's
coordinates to a third-party Maps provider, the answer drives whether
Google Places needs its **own** row in the label's data-categories
section (§2 of `APP_PRIVACY_LABEL_DRAFT.md`), not only the third-party
processors table (§6). This needs a legal answer before submission.

**Privacy policy updates this v1.1 likely needs (legal review required):**

- §2.4 currently says "We do **not** collect GPS location." This is
  **contradicted** by v1.1 mobile behaviour. Must be reconciled before
  v1.1 ships to TestFlight / App Store.
- §4 third-party processors table: add Google Places (data shared:
  search coordinates + sport keyword for venue density during the picker
  session; no user identifier).
- §3 "How we use your information" should mention venue-search
  third-party lookup (or be explicit that Maps provider is used).

**App Privacy Label Draft updates this v1.1 likely needs:**

- §2.7 row should flip from "Currently No" to "Yes — Precise Location,
  foreground only, used for venue search; not linked to user; not used
  for tracking" (legal to confirm phrasing).
- §6 third-party table: add Google Places row.

**Do not write either document from this QA pass.** Both are
upstream-owned (operator / legal). This QA pass flags them; the owner
patches them as part of v1.1 release prep.

---

## 5. Attribution checklist

- [x] `requiresGoogleAttribution` derived from
      `venues.some(v => v.source === 'google_places' || v.attributionRequired === true)`
      (`NearbyCourtsModal.tsx:136-138`).
- [x] Chip rendered only when `requiresGoogleAttribution === true`
      (`NearbyCourtsModal.tsx:411-418`).
- [x] Chip absent on seed-only result sets (covered by
      `NearbyCourtsModal.test.tsx` — `google_places` tests at
      lines 1054, 1163, 1193).
- [x] Chip absent on empty/error state — `venues` is `[]`, so
      `.some(...)` is `false`.
- [ ] **TestFlight visual check** (not a defect today, just verify):
  - Chip is `borderTop`'d with `surfaceElevated` background and sits
    above the manual footer (`NearbyCourtsModal.tsx:668-685`). When
    `showManualFooter` is **false** (parent did not pass `onSelectManual`),
    the chip becomes the last element of the container — confirm it is
    not visually cropped by the safe-area / Modal bottom inset on
    notched iOS devices.
  - Map mode (`mode === 'map'`) with a Places-sourced selection: the
    chip should still appear below the map's bottom-positioned overlay
    (`mapPreview` / `mapHint` use `position: 'absolute'`, so the chip
    is in normal flow below). Confirm there's no overlap with the
    map's bottom-positioned hint card.
  - `colors.textTertiary` at 11px on `colors.surfaceElevated` — verify
    contrast against the dark/neon theme on a real device. The 11px
    font is intentionally subdued but must still meet readability
    expectations for a required attribution.
- [x] Attribution copy is plain ASCII: `Powered by Google`
      (`NearbyCourtsModal.tsx:416`).
- [x] Accessibility label set on the wrapper:
      `accessibilityLabel="Powered by Google"`
      (`NearbyCourtsModal.tsx:414`).

---

## 6. Fallback behavior

| Scenario | Behaviour | Verified by |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` unset | Provider short-circuits to `[]` before HTTP. `source=both` collapses to seed-only. Attribution chip stays hidden. | `test_places.py:114-124, 127-151` |
| Upstream timeout | `[]`, cached as `[]` for the TTL window. Picker shows seed-only. | `places.py:258-261` |
| Upstream non-200 | Same as timeout. | `places.py:278-285` |
| Upstream non-JSON | Same as timeout. | `places.py:287-292` |
| Unknown sport | Empty without HTTP. | `places.py:208-210` + `test_places.py:219-230` |
| No coordinates + `source=both` | Service degrades to seed-only (Places branch needs coords). | `venues.py:216` |
| Places row falls just outside `radius_km` | Filtered post-response via Haversine. | `venues.py:248-258` |
| Places row duplicates a seed row | Dropped on `source=both` (seed wins for curated metadata). | `venues.py:236-245` |
| Quota exceeded (would surface as non-200 from Google) | Same as non-200: `[]`, cached, picker shows seed-only. **No user-visible error.** Operator must monitor server logs / Google quota dashboard. | `places.py:278-285` |

### Safety-bullet test coverage

The five production-readiness safety bullets requested for this release
map to existing or new tests as follows. No real network calls; all
provider interactions are mocked.

| # | Safety bullet | Test(s) |
|---|---|---|
| 1 | Missing `GOOGLE_PLACES_API_KEY` does not crash the provider | `apps/api/tests/test_places.py::test_missing_api_key_returns_empty_without_http`; `apps/api/tests/test_places.py::test_empty_key_short_circuit_runs_before_cache_lookup`; `apps/api/tests/test_venues.py::test_source_places_empty_provider_returns_200_empty_not_500` |
| 2 | `source=both` falls back to seed when Places provider raises | `apps/api/tests/test_venues.py::test_source_both_falls_back_to_seed_when_provider_raises` |
| 3 | `source=places` returns a safe empty response on provider failure | `apps/api/tests/test_venues.py::test_source_places_empty_provider_returns_200_empty_not_500`; provider-side `test_places.py` timeout / `HTTPError` / non-200 / non-JSON suite |
| 4 | Places result outside `radius_km` is excluded | `apps/api/tests/test_venues.py::test_source_places_excludes_places_outside_radius_km`; `::test_source_both_excludes_places_outside_radius_km_but_keeps_seed`; `::test_source_both_includes_in_radius_places_with_tight_radius` |
| 5 | Raw Google JSON not exposed on the wire | `apps/api/tests/test_venues.py::test_source_places_response_exposes_no_raw_google_fields` (new — pins the response key-set against a Google-field denylist); `test_places.py::test_sends_required_field_mask_and_api_key_headers` (heavy-SKU field-mask denylist); `test_places.py::test_normalizes_response_to_internal_place_result` |

---

## 7. TestFlight QA checklist (v1.1)

Run after a clean install on a real iOS device with a TestFlight build
that has `GOOGLE_PLACES_API_KEY` set on the backend.

**Permission flow:**

- [ ] Open the venue picker for the first time → OS prompt for location
      appears once.
- [ ] Allow → picker renders results and the status banner shows
      `Sorted near you`.
- [ ] Deny → picker renders seed catalog and status banner shows
      `Location off. Showing Sydney catalog.` Attribution chip is hidden.
- [ ] Background → foreground → re-open picker → no second prompt (the
      hook gates re-prompts via `startedRef`).

**Source / merge behaviour:**

- [ ] Pick a sport with a sparse seed (e.g. badminton in Sydney): with
      location ON, picker shows clearly more results than seed alone.
- [ ] Same sport with location OFF: picker shows only seed entries.
- [ ] Pick a sport that maps to a Places `included_type` (gym, golf):
      results lean on `searchNearby` and the attribution chip is
      present when any Places row is in the visible list.

**Attribution:**

- [ ] When any venue card visible in the list has `source === 'google_places'`
      (the `NearbyCourtsModal.test.tsx` suite asserts the wiring; on
      device, confirm visually) → `Powered by Google` chip visible.
- [ ] Seed-only results (location denied OR all Places merged out as
      duplicates) → chip absent.
- [ ] Manual footer hidden (parent did not pass `onSelectManual`) →
      chip is still visible without being cropped by safe-area / home
      indicator.
- [ ] Map mode + Places result selected → chip visible below the map.

**Map / list parity:**

- [ ] Switching list ↔ map preserves the same venue set; tapping a pin
      whose row is Places-sourced still selects correctly.
- [ ] "Wider results" toggle (where enabled) widens the radius and
      Places provider re-fires (or hits the wider cache key).

**No regressions:**

- [ ] No "AIza" string or Places URL in the mobile bundle (sanity scan
      via release build output if practical).
- [ ] Network tab (Charles / Proxyman on simulator): mobile only hits
      `EXPO_PUBLIC_API_URL`, never `places.googleapis.com`.

---

## 8. Cost / rate-limit operations checklist

- [ ] Google Cloud Console: budget alert configured on the Places API
      project (recommend: alerts at 50%, 80%, 100% of the agreed monthly
      ceiling; on-call email subscribed).
- [ ] Quota: confirm the project's `places.googleapis.com` quota covers
      expected TestFlight volume + 24h cache hit rate (cache key density
      keeps a Sydney-scale tester pool to single-digit calls per
      sport-suburb pair per day).
- [ ] Dashboard: track Places API call count + error rate in the Cloud
      Console; raise an alert on sustained non-200 rate > 5%.
- [ ] If quota exceeded: provider fails closed (§6 above). Picker silently
      degrades to seed-only. **No user-visible error.** Operator must
      detect via dashboard, not via in-app signal.

### Verification commands (production secret setup)

> **Do not run these from this QA pass.** They are the documented
> commands for the release-runbook owner. Never paste a real key into
> docs / chat / commits — set it from a local shell only.

```bash
# 1. Set the secret on Fly. Either short or long flag works.
fly secrets set GOOGLE_PLACES_API_KEY="..." -a protin-api
# equivalent: fly secrets set GOOGLE_PLACES_API_KEY="..." --app protin-api

# 2. Confirm the variable name is present (Fly does not print the value).
fly secrets list -a protin-api | grep GOOGLE_PLACES_API_KEY

# 3. Restart and smoke the route end-to-end.
fly deploy -a protin-api
```

### Manual API smoke (run from a logged-in shell with a bearer token)

Both calls hit the Protin backend, which then talks to Google. The
mobile client is intentionally not involved.

```bash
# source=places — Places-only (requires coordinates)
curl -fsS "https://protin-api.fly.dev/venues/nearby?sport=tennis&lat=-33.89&lng=151.27&source=places" \
  -H "Authorization: Bearer <token>" | jq '.items[] | {source, name, distance_km}'

# source=both — seed merged with Places, deduped server-side
curl -fsS "https://protin-api.fly.dev/venues/nearby?sport=gym&lat=-33.89&lng=151.27&source=both" \
  -H "Authorization: Bearer <token>" | jq '.items[] | {source, name, distance_km, attribution_required}'
```

Expected:
- `source=places`: items have `"source": "google_places"` and
  `"attribution_required": true` (or `[]` if the key is unset / the
  provider failed closed).
- `source=both`: items are a mix of `"seed"` and `"google_places"`;
  `attribution_required` is `true` for the Places rows and `false` for
  the seed rows.

---

## 9. Known limitations

- **In-process cache only.** TTL cache lives in the Python process. On
  multi-instance Fly deploys, each replica warms its own cache. Not a
  correctness issue, just a small quota inflation on cold replicas.
  Future: swap to Redis behind the same `_cache_get` / `_cache_put`
  helpers (`places.py:117-121`).
- **No metrics / structured logging on provider outcomes.** Today the
  module logs warnings on failure (`places.py:259, 263, 269, 279, 290`).
  No counter is emitted, so quota dashboards in Google Cloud are the
  only operational signal.
- **No persisted record of Places rows.** Intentional for privacy and
  cost, but means picker history / "recently selected" cannot include
  Places rows across sessions without persisting `provider_place_id`.
  Not in v1.1 scope.
- **`Location.Accuracy.Balanced`** is documented but not yet matched in
  the privacy policy / App Privacy label. See §10 below.

---

## 10. Release-blocking issues

The Google Places integration **code** is release-ready. The blockers
below are documentation gaps owned upstream — they must be resolved
before v1.1 can submit to TestFlight / App Store, but they do not
require code changes from this branch.

| # | Blocker | Owner | File |
|---|---|---|---|
| 1 | Privacy Policy §2.4 says "We do **not** collect GPS location." Contradicts v1.1 mobile (`useVenueLocation` calls `Location.getCurrentPositionAsync`). Must be reconciled before App Store submission. | Operator / legal | `docs/legal/PRIVACY_POLICY.md` |
| 2 | Privacy Policy §4 third-party processors table does not list Google Places. Backend sends search coordinates to Google. | Operator / legal | `docs/legal/PRIVACY_POLICY.md` |
| 3 | App Privacy Label Draft §2.7 says automatic precise-location detection is "Currently No." Needs to flip to "Yes — foreground only, App Functionality" with legal-approved phrasing. | Operator / legal | `docs/archive/release/APP_PRIVACY_LABEL_DRAFT.md` |
| 4 | App Privacy Label Draft §6 third-party services table does not list Google Places. | Operator / legal | `docs/archive/release/APP_PRIVACY_LABEL_DRAFT.md` |
| 5 | Open legal question: does sending lat/lng to Google Places require Google Places its own row in §2 of the App Privacy Label, or only in §6 (third-party processors)? Affects label categorisation. | Operator / legal | n/a |
| 6 | `docs/deployment/RELEASE_RUNBOOK.md:26-27` `fly secrets set` command does not include `GOOGLE_PLACES_API_KEY`. Concrete release-prep gap. | Release runbook owner | `docs/deployment/RELEASE_RUNBOOK.md` |

**Do not edit any of the files above from this QA pass.** They are
listed here so the owner can patch them before submission. This QA
flagged the gaps; sign-off belongs to operator + legal.

---

## 11. Non-blocking follow-ups

- Add `GOOGLE_PLACES_API_KEY` to `docs/archive/staging/ENV_VARS.md` if that
  document is treated as the canonical env-var reference.
- Consider a tiny metric counter (success / cache-hit / failure /
  fallback-empty) emitted from `places.py` so the operator gets an
  in-app signal rather than relying solely on Google Cloud dashboards.
- Consider promoting the in-process cache to Redis once multi-instance
  Fly is in play, to reduce cold-replica quota inflation.
- TestFlight visual check on dark/neon theme: confirm the 11px
  `textTertiary` "Powered by Google" attribution chip remains
  comfortably readable.
- Consider a one-line "Showing Sydney catalog + Google venue density"
  status banner when `source=both` returns Places rows, so testers
  understand the source mix without inspecting the chip.

---

## 12. Validation run

| Check | Command | Result |
|---|---|---|
| API tests (places + venues) | `python -m pytest apps/api/tests/test_places.py apps/api/tests/test_venues.py -q` | **PASS — 72 / 72** (5.65s) |
| Mobile typecheck | `npm run typecheck --workspace @protin/mobile` | **PASS** (`tsc --noEmit`, no diagnostics) |
| Working-tree scope | `git status --short --untracked-files=all` | `M apps/api/tests/test_venues.py` (new safety test for wire-side raw-Google-field denylist) and `?? docs/archive/release/GOOGLE_PLACES_RELEASE_QA.md` (this doc). No generated/cache files. |

No shared-types typecheck was run, so no `tsconfig.tsbuildinfo` was
regenerated.

---

## 13. Re-review handoff

This document is the QA deliverable. The Codex re-reviewer should:

1. Confirm the integration-summary file references at §2 still line up
   with the current branch.
2. Confirm none of the §10 release-blockers regressed (privacy / label /
   runbook unchanged from this snapshot — i.e. owner has not yet
   patched them).
3. Run the §12 validation block and confirm pass.
4. Hand back to operator / legal to address §10 release-blockers
   upstream before any v1.1 TestFlight submission.
