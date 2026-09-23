# Venue Search — Operations Runbook

Operational reference for the `/venues/nearby` and
`/venues/places/{place_id}` endpoints and the Google Places (New)
provider that backs them.

Companion documents:

- `docs/archive/release/GOOGLE_PLACES_RELEASE_QA.md` — release / privacy QA
  pass for v1.1.
- `docs/deployment/RELEASE_RUNBOOK.md` — Fly deploy + venue catalog
  seed.

---

## 1. Required configuration

| Variable | Where | Default | Notes |
|---|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Fly secret on `protin-api` | unset | **Backend Places Web Service key.** When unset, the provider short-circuits to "disabled" and `/venues/nearby` falls back to seed-only without any HTTP call. NEVER expose this to the mobile bundle. |
| `REDIS_URL` | Fly secret | required | Used by slowapi for the `/venues/nearby` and `/venues/places/*` rate limits. Without it, slowapi raises on every request — `limiter.enabled` is set to `False` only in the test suite. |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` *(or `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` / `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`)* | Mobile `.env` / EAS env vars | unset | **Mobile Maps SDK rendering key.** Distinct from the backend Places key — restricts to Maps SDK for iOS/Android only and is application-restricted to the SportsGang bundle ID + SHA-1. When unset, `VenueMapView` falls back to `PROVIDER_DEFAULT` so the map never goes blank with Google-Places-sourced rows visible. See §10. |

Set the Places key:

```bash
fly secrets set GOOGLE_PLACES_API_KEY="..." --app protin-api
fly secrets list --app protin-api | grep GOOGLE_PLACES_API_KEY
fly deploy --app protin-api
```

---

## 2. Google Cloud key restrictions

The Places key is **server-to-server** and must never ship in a mobile
bundle. Recommended Google Cloud Console restrictions:

- **API restriction:** "Places API (New)" only. Do NOT enable Maps SDK
  for Android / iOS on the same key.
- **Application restriction:** IP restriction is the strongest control
  when the egress IP is stable. Fly egress IPs are not generally stable
  across regions — alternatives:
  - Leave the application restriction as "None" but rely on API
    restriction + monthly budget alert. Acceptable for v1.
  - Pin a dedicated Fly machine pool to a single egress IP and add an
    IP restriction. Tracked for v2.
- **Quotas:** set a per-day Places API quota matching the expected
  TestFlight + early access volume.
- **Budget alerts:** Cloud Console → Billing → Budgets & alerts →
  configure alerts at 50% / 80% / 100% of the agreed monthly ceiling.

For the mobile Google Maps tiles surface, use a **separate** key
restricted by iOS bundle ID and Android package + SHA-1.

---

## 3. Smoke tests

All commands assume a bearer token in `$TOKEN` (any logged-in account)
and `protin-api.fly.dev` as the host.

### 3.1 source=seed (no Places call)

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://protin-api.fly.dev/venues/nearby?sport=tennis&source=seed&limit=10" \
  | jq '{provider_status, total, items: .items | map({source, name})}'
```

Expected:
- `provider_status == "disabled"` (provider was not consulted).
- All `items[].source == "seed"`.

### 3.2 source=places without coordinates

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://protin-api.fly.dev/venues/nearby?sport=tennis&source=places" \
  | jq '{provider_status, total, items_count: (.items | length)}'
```

Expected:
- `provider_status == "missing_coordinates"`.
- `total == 0`, `items == []`.
- No Google Places call was made.

### 3.3 source=both with coordinates

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://protin-api.fly.dev/venues/nearby?sport=gym&lat=-33.89&lng=151.27&source=both" \
  | jq '{provider_status, next_cursor, items: .items | map({source, name, distance_km})}'
```

Expected:
- `provider_status == "ok"` (key set and Google responded).
- A mix of `source == "seed"` and `source == "google_places"`.
- Distances are monotonically non-decreasing.

### 3.4 Free-text query

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://protin-api.fly.dev/venues/nearby?sport=tennis&lat=-33.89&lng=151.27&source=both&q=indoor%20tennis" \
  | jq '.items | map({source, name})'
```

### 3.5 Load more via cursor

```bash
NEXT=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://protin-api.fly.dev/venues/nearby?sport=tennis&lat=-33.89&lng=151.27&source=places&q=tennis%20court" \
  | jq -r '.next_cursor // empty')

if [ -n "$NEXT" ]; then
  curl -fsS -H "Authorization: Bearer $TOKEN" \
    "https://protin-api.fly.dev/venues/nearby?sport=tennis&lat=-33.89&lng=151.27&source=places&q=tennis%20court&cursor=$(jq -rn --arg c "$NEXT" '$c|@uri')" \
    | jq '{items_count: (.items | length), next_cursor}'
fi
```

Expected: a second page of distinct Places rows (or `next_cursor: null`
indicating no further pages).

**Cursor pagination semantics** (Codex fix):

- `source=both` **first page** (no cursor): seed catalog + first
  Google Places page, merged + deduped + sorted by distance.
  Response includes `next_cursor` when Google's Text Search returned
  a `nextPageToken`.
- `source=both` **cursor page** (cursor present): treated as a Google
  Places continuation only. Seed rows are NOT re-included. This is
  intentional — re-loading seed on every page would let already-shown
  seed rows eat the `limit` slots and the mobile "Load more" button
  would silently surface no new venues even when Google had more to
  offer.
- `source=places` + cursor: Places continuation only (same as today).
- `source=seed` + cursor: cursor has no meaning for the static
  catalog; it is ignored and the response is the cursor-less seed
  page.
- Invalid / corrupt cursor: the provider returns `status="error"`;
  the route surfaces `items=[]`, `provider_status="error"`,
  `next_cursor=null`. The API does not 4xx on a bad cursor — keeping
  it soft so a stale mobile cache can't crash the picker.

### 3.6 Lazy-load Place Details (one tap per venue)

```bash
PLACE_ID="ChIJN1t_tDeuEmsRUsoyG83frY4"  # any place_id from §3.3
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://protin-api.fly.dev/venues/places/$PLACE_ID" \
  | jq '{name, primary_type, rating, user_rating_count, business_status, opening_hours_count: (.opening_hours | length)}'
```

Expected: a single normalised body. Never used during list/search.

### 3.7 Provider failure / quota path (manual / mocked)

A live quota-exceeded smoke is not safe to run on demand. To rehearse:

```bash
# Temporarily rotate the secret to an invalid key, then redeploy.
fly secrets set GOOGLE_PLACES_API_KEY="invalid" --app protin-api
fly deploy --app protin-api

# Call source=both with coords. Expected:
#   provider_status == "error", items contain only seed rows.
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://protin-api.fly.dev/venues/nearby?sport=tennis&lat=-33.89&lng=151.27&source=both" \
  | jq '{provider_status, items: .items | map(.source)}'

# Restore the real key when done.
fly secrets set GOOGLE_PLACES_API_KEY="<real-key>" --app protin-api
fly deploy --app protin-api
```

### 3.8 Full backend smoke (`scripts/smoke_venues_live.py`)

End-to-end smoke that exercises the live FastAPI endpoint (not Google
directly) across the supported sport / location / radius / source
matrix and reports a pass / fail summary.

> **This is a PAID live code path.** Every `/venues/nearby` call with
> `source=places` or `source=both` server-side fires one or more Google
> Places (New) SKU-billable requests. Use `--dry-run` first; scope with
> `--sports` / `--locations` / `--radii` / `--max-calls` to control
> spend. Always run **staging first**.

**Token handling.** The bearer comes from the `PROTIN_SMOKE_TOKEN`
environment variable by default -- preferred over `--token` because
CLI arguments are visible in shell history and `ps` listings. The
script NEVER prints token or `GOOGLE_PLACES_API_KEY` values.

#### Step 1 -- dry-run plan (no HTTP, no token required)

```bash
cd apps/api
python -m scripts.smoke_venues_live \
  --base-url https://STAGING_API_HOST \
  --dry-run
```

The dry-run prints every planned request, scoped by the current
`--sports` / `--locations` / `--radii` / `--sources` / `--max-cursors`
values, and exits 0 without making any HTTP calls. Use it to confirm
the planned shape before paying for a live run. Validation also
catches typos in `--sports` / `--locations` here.

#### Step 2 -- scoped staging probe

```bash
export PROTIN_SMOKE_TOKEN="<staging-bearer>"

python -m scripts.smoke_venues_live \
  --base-url https://STAGING_API_HOST \
  --output smoke-staging.json \
  --sports tennis,gym \
  --locations usyd \
  --max-cursors 2 \
  --max-calls 30
```

Run a single-location, two-sport probe first so any contract
regression surfaces before the full matrix.

#### Step 3 -- full staging run

```bash
PROTIN_SMOKE_TOKEN="<staging-bearer>" \
  python -m scripts.smoke_venues_live \
    --base-url https://STAGING_API_HOST \
    --output smoke-staging.json
```

#### Step 4 -- production (only after staging is green)

> Production runs spend live quota. Re-confirm with the operator that
> billing alerts are armed, then use a **fresh, scoped, short-lived**
> bearer token. Tear it down immediately afterwards.

```bash
PROTIN_SMOKE_TOKEN="<short-lived-prod-bearer>" \
  python -m scripts.smoke_venues_live \
    --base-url https://protin-api.fly.dev \
    --output smoke-prod-$(date -u +%Y%m%dT%H%M%SZ).json
```

#### Coverage

- `source=seed` baseline for every sport (no Places call expected).
- `source=places` without coords for every sport. **Asserted shape:**
  `http_status=200`, `provider_status="missing_coordinates"`,
  `items_count=0`, `google_places_count=0`, `next_cursor=null`.
- An invalid cursor. **Asserted shape:** NOT 5xx, `http_status=200`,
  `provider_status="error"`, `items_count=0`, `next_cursor=null`. (If a
  future backend change moves this to 4xx, update both the assertion
  here and the contract docs in `apps/api/app/services/venues.py`.)
- Full matrix: 7 sports x 3 Sydney locations x {10 km, 50 km} x
  {`places`, `both`}.
- `source=both` cursor follow-up across up to `--max-cursors` distinct
  sports. Each follow-up asserts no `seed` rows on the cursor page and
  reports `repeated_id_count` (overlap with the first page's IDs).

#### Estimated call volume (default scope)

| Phase | Calls |
|---|---|
| `source=seed` baseline (per sport) | 7 |
| `source=places` no-coords (per sport) | 7 |
| Invalid cursor | 1 |
| Matrix (7 sports x 3 locations x 2 radii x 2 sources) | 84 |
| Cursor follow-ups | up to `--max-cursors` (default 7) |
| **Total static plan** | **~99** |
| Retries (transient 5xx / transport, max 3 attempts each) | + up to a few |

`--max-calls` (default 120) caps the planned shape and **aborts before
any HTTP** if the scoped plan exceeds it. Bump it explicitly if you
genuinely want a bigger run.

#### Failure conditions (non-zero exit)

- any unexpected `http_status >= 400`,
- any final transport failure after retries,
- `source=places` no-coords NOT matching the documented `200 +
  missing_coordinates + items=[]` shape,
- invalid cursor returning 5xx OR anything other than the documented
  `200 + provider_status=error + next_cursor=null` shape,
- `source=places` with coords returning `provider_status` in
  `{disabled, error, quota_exceeded}`,
- more than half of (sport x Sydney location x radius) combos under
  `source=places` returning zero `google_places` rows -- broken key,
  missing billing, or a strategy-table regression,
- a `source=both` cursor follow-up returning any `seed` row.

#### Interpreting the output

- **`provider_status`** is the headline health signal:
  - `ok` -- Google responded with results.
  - `disabled` -- backend key unset (or sport unsupported).
  - `quota_exceeded` -- GCP quota or billing event; raise on-call.
  - `error` -- timeout / non-2xx / malformed.
  - `missing_coordinates` -- request shape was places/both without
    `lat/lng`. Expected for the negative scenario; failure anywhere
    else with coords.
- **`google_places_count == 0` while `provider_status == "ok"`** in a
  Sydney location is the canary for sport-mapping drift. A single zero
  for one sport-location pair is noise; >50% across the matrix is the
  hard-failure threshold.
- **Counts alone do not prove relevance.** A `running` row that
  returns 20 `gym` venues is "ok / 20 rows" but useless to the user.
  Inspect the top-5 tuning fields below before declaring victory.

#### Output fields for sport-mapping relevance tuning

`--output` writes per-request CSV or JSON. Use these fields when
tuning `_SPORT_STRATEGIES` in `apps/api/app/services/places.py`:

- `top_5_names`, `top_5_addresses` -- eyeball that the venue actually
  serves the requested sport.
- `top_5_primary_types`, `top_5_types` -- Google's classification per
  row. A `tennis` query that surfaces `primary_type="gym"` is a
  mapping miss.
- `top_5_provider_place_ids` -- stable Google IDs for cross-run
  diffing.
- `top_5_distance_km`, `max_distance_km` -- catch rows just over the
  radius cap leaking through.
- `top_5_google_maps_uri_present`, `top_5_attribution_required` --
  confirm attribution metadata is making it through normalisation.
- `duplicate_id_count` -- non-zero indicates a dedup regression.
- `repeated_id_count` (cursor follow-up rows only) -- non-zero means
  the cursor page overlaps with the first page; small numbers are
  expected if Google's pagination is not strict, large numbers mean
  the cursor isn't actually advancing.

#### CLI reference

| Flag | Default | Purpose |
|---|---|---|
| `--base-url` | required | API root, no trailing slash. |
| `--token` | env `PROTIN_SMOKE_TOKEN` | Bearer. Env var preferred. |
| `--output` | none | `.csv` or `.json` per-request results. |
| `--dry-run` | off | Print plan, no HTTP, no token required. |
| `--sports` | all 7 | Comma-separated subset. |
| `--locations` | all 3 | Comma-separated subset. |
| `--radii` | `10,50` | Comma-separated integers (km). |
| `--sources` | `places,both` | Coord-mode sources for the matrix. |
| `--max-cursors` | 7 | Cap on cursor follow-up requests. |
| `--max-calls` | 120 | Hard cap on planned static + follow-up calls; aborts before any HTTP if exceeded. |

---

## 4. Caching

In-process TTL cache (`apps/api/app/services/places.py`):

- **TTL:** 30 minutes on successful results only. Error and quota
  outcomes are NOT cached — a transient Google failure must not pin a
  30-minute window of bad responses for the next caller.
- **Bucketing:** lat/lng rounded to 2 dp (~1 km grid), radius rounded
  to 1 dp. Two testers a city block apart share the same cache row.
- **Size:** FIFO bounded at 256 entries.
- **Scope:** process-local. On multi-instance Fly deploys each replica
  warms its own cache. Acceptable for v1.1 cost ceiling; promote to
  Redis if observed quota inflation exceeds budget. See TODO at
  `apps/api/app/services/places.py:_CACHE_TTL_SECONDS`.

Cost-trigger surfaces (every one of these can fire a paid Places call
when the cache misses):

- picker open with location enabled (`source=both`)
- each debounced search keystroke (300 ms in
  `apps/mobile/src/screens/bookings/NearbyCourtsModal.tsx`)
- radius chip change
- Load More tap (Text Search pagination)
- venue detail tap (`/venues/places/{id}` — heavier SKU bracket)

---

## 5. Rate limits

slowapi enforces per-IP limits on both routes
(`apps/api/app/routers/venues.py`):

| Route | Limit | Rationale |
|---|---|---|
| `GET /venues/nearby` | 60/minute/IP | One picker session ≈ 15 requests; 60/min is generous for real use, tight enough to cap a stuck retry loop. |
| `GET /venues/places/{id}` | 30/minute/IP | One tap per venue — even an active session rarely opens more than a few. |

Tests disable the limiter via `limiter.enabled = False` in
`apps/api/tests/conftest.py`.

---

## 6. Observability — what to monitor

The Places provider currently logs warnings on failure
(`apps/api/app/services/places.py`). There are no native metric
counters yet (see §9). Until they're added, monitor through these
external signals:

| Signal | Where | Why it matters |
|---|---|---|
| `provider_status` distribution | Application logs / Sentry breadcrumbs | High `error` / `quota_exceeded` ratio = real Places outage or misconfigured key. Expected steady-state: ≥ 90% `ok` once the key is configured. |
| `places.googleapis.com` call count | Google Cloud Console → APIs & Services → Metrics → Places API (New) | Quota burn vs. monthly ceiling. Cross-check against per-tester volume. |
| Places error rate | Same metrics dashboard, "Error rate" panel | Sustained > 5% non-200 → page operator. Most likely cause is a billing / quota event on the GCP project, not a code regression. |
| Quota exceeded count | Cloud Console quota panel | Drives the §3.7 rehearsal — if hit in production, picker silently falls back to seed only. |
| Places latency | Cloud Console p50 / p95 | Slow provider blocks the picker open. The provider boundary uses a 10 s timeout (`_DEFAULT_TIMEOUT_SECONDS`). |
| Empty-result rate by sport | Application logs grouped by sport | Sparse sports (badminton, soccer) may need additional `nearbyTypes` / `textQueries` entries in `_SPORT_STRATEGIES`. |
| Cache hit rate (proxy) | Difference between request volume to `/venues/nearby?source=both` and outbound Places calls | Falling hit rate without a proportional traffic spike = cache pressure or TTL misconfigured. |
| Mobile crash / error reports | Sentry → mobile project | Banners for `quota_exceeded` / `error` should be visible; missing banners = mobile regression. |

---

## 7. Privacy and attribution behavior

- Mobile foreground location is sent only as query string (`lat`,
  `lng`) on `/venues/nearby`. It is not persisted server-side.
- Backend forwards coordinates plus the sport keyword to
  `places.googleapis.com`. No user identifier is sent.
- Google Places content (names, addresses) is never written to the
  local Venue table. Only `provider_place_id` may be stored when
  explicitly persisted (booking / event venue references); this is
  permitted by Google's terms.
- The mobile picker renders "Powered by Google" attribution whenever
  any visible row has `source == "google_places"` or
  `attribution_required == true`.
- Map mode prefers `PROVIDER_GOOGLE` when any Places-sourced row is in
  the list AND the mobile Maps SDK key is configured (see §10). When
  the key is unset the picker falls back to `PROVIDER_DEFAULT` so the
  map never renders blank. The "Powered by Google" attribution chip
  rendered in list view is independent of the map provider and
  satisfies the Places content attribution requirement.
- Server access logs may capture URL + query string. Do NOT add
  additional logging that records raw lat/lng to a persistent store
  without coarsening (e.g. round to 2 dp) or redaction.

---

## 8. Fallback UX expectations

| Server state | Mobile UI |
|---|---|
| `provider_status == "ok"` | Mixed list, attribution chip visible when any Places row present. |
| `provider_status == "disabled"` | Seed-only list, no attribution chip. (Either `source=seed` was requested or the key is unset.) |
| `provider_status == "missing_coordinates"` | Banner: "Enable location to search beyond the Sydney catalog." Seed-only list. |
| `provider_status == "quota_exceeded"` | Banner: "Search quota reached. Showing seed catalog only." Seed rows still surface. |
| `provider_status == "error"` | Banner: "Google Places unavailable. Showing seed catalog only." Seed rows still surface. |
| `/venues/places/{id}` 503 | Soft "Details unavailable" — mobile may keep the search row's data and skip the rich detail view. |
| `/venues/places/{id}` 502 | Same as 503 from the user's perspective. Operator sees the difference in logs. |

The mobile picker always offers a manual venue-name entry footer when
the parent passes `onSelectManual` — see
`apps/mobile/src/screens/bookings/NearbyCourtsModal.tsx`.

---

## 9. Mobile Google Maps SDK rendering key

This key is **separate** from `GOOGLE_PLACES_API_KEY`:

| | Mobile Maps SDK key | Backend Places key |
|---|---|---|
| Variable | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (or `..._IOS_API_KEY` / `..._ANDROID_API_KEY`) | `GOOGLE_PLACES_API_KEY` |
| Where it lives | Mobile bundle (via `app.config.js`) | Fly secret on `protin-api` |
| Surface | Renders Google map tiles in `VenueMapView` | Calls Google Places (New) Web Service from the FastAPI backend |
| GCP API restriction | Maps SDK for iOS + Maps SDK for Android only | Places API (New) only |
| GCP app restriction | iOS bundle ID + Android package + SHA-1 | IP-restricted (when possible) or unrestricted with API restriction + budget alert |
| Safe to leak? | App-restricted by GCP, but should never be printed in logs/docs | NEVER — server-to-server only |

**Without the mobile key for the CURRENT platform, `VenueMapView`
automatically falls back to `PROVIDER_DEFAULT`** (Apple Maps on iOS,
the platform Google embed on Android) so the map never goes blank
when Google-Places-sourced rows are visible. The fallback is
**platform-aware**: `VenueMapView` reads `Platform.OS` and looks at
`Constants.expoConfig?.extra?.googleMapsConfiguredIos` /
`googleMapsConfiguredAndroid`. A build that ships with only the iOS
Maps key set will therefore render Google tiles on iOS but fall
back to the default provider on Android (and vice versa). On web /
other platforms `PROVIDER_GOOGLE` is never forced.

The "Powered by Google" attribution chip in list view is independent
of the map provider and still renders next to Places-sourced rows.

Setting up the Maps SDK key for a production EAS build:

```bash
# Set it on the production EAS environment. EAS does not echo the
# value back; verify by name only.
cd apps/mobile
eas env:create --environment production \
  --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value "<key>" \
  --visibility plaintext

eas env:list --environment production | grep EXPO_PUBLIC_GOOGLE_MAPS
```

For staging / TestFlight builds, repeat with `--environment preview`.
For local builds, set it in `apps/mobile/.env`.

---

## 10. Sport strategy

`_SPORT_STRATEGIES` in `apps/api/app/services/places.py` declares the
fan-out for each supported sport. The hybrid search dispatches the
Nearby Search AND every Text Search phrase per call (no early-exit on
the user-facing `limit`) — the 30-minute 2dp-lat/lng cache absorbs
repeat opens, so the worst-case spend per uncached invocation is
`1 Nearby + N Text` calls, where N is the phrase count below.

| Sport | Nearby Search types | Text Search queries (playable facilities only) |
|---|---|---|
| tennis | tennis_court, sports_complex, sports_club | tennis court, tennis courts, public tennis court, tennis club, tennis centre, tennis center, indoor tennis court |
| basketball | athletic_field, sports_complex, playground, park | basketball court, public basketball court, indoor basketball court, outdoor basketball court, basketball stadium, sports centre basketball court, recreation centre basketball court |
| badminton | sports_complex, gym, sports_club | badminton court, badminton courts, badminton centre, badminton center, indoor badminton court, sports hall badminton, indoor sports centre badminton, recreation centre badminton |
| soccer | athletic_field, stadium, sports_complex, park | soccer field, football field, football pitch, soccer pitch, futsal court, indoor soccer court, sports field soccer, public soccer field |
| football | athletic_field, stadium, sports_complex, park | football field, soccer field, football pitch, soccer pitch, futsal court, indoor soccer court, sports field soccer, public soccer field |
| running | athletic_field, stadium, park, **city_park** | running track, athletics track, public running track, sports oval, running trail, park running trail, athletics field |
| gym | gym, fitness_center | gym, fitness centre, fitness center, training gym, health club, indoor fitness centre |
| golf | golf_course, indoor_golf_course | golf course, golf club, driving range, golf driving range, mini golf, putt putt, pitch and putt, public golf course |
| _general fallback_ | sports_complex, stadium, park | sports complex, sports centre, recreation centre, park, stadium |

`city_park` was added to the running mapping after the Codex review
flagged missing council/municipal park coverage (Centennial Park,
Sydney Park) for runners. If Google rejects a type in a future API
change, update the mapping and add a comment explaining the removal —
do not silently drop coverage.

The **general fallback** is used when a free-text `q` is supplied for
a sport not in the strategy table (e.g. an experimental
`sport=pickleball&q=pickleball court`). Pure unknown sports without a
`q` still short-circuit to `disabled` without any HTTP call — see
`test_unknown_sport_returns_empty_without_http`.

**Default discovery uses playable facility phrases, not bare sport
keywords.** Every text query in `_SPORT_STRATEGIES` (and the general
fallback) names a facility — court, field, pitch, range, track,
centre, course, club. Bare sport words like `golf` / `tennis` /
`basketball` are NEVER sent to Places — they return retail / pro
shops at the same SKU spend as a proper facility query.

**Bare-sport-keyword `q` guard.** When an explicit `q` is supplied
and its value (case- and whitespace-insensitive) is exactly a bare
sport keyword — `golf` / `soccer` / `football` / `basketball` /
`tennis` / `badminton` / `running` — the backend drops `q` and uses
the sport's playable-facility pack instead. Mobile sometimes echoes
the sport name back as `q` (user types "golf" in the search box); a
bare-keyword Text Search would otherwise pull retail / pro shops.
Legitimate specific queries like `q="Moore Park Golf Course"` or
`q="driving range"` are forwarded unchanged. Pinned by
`test_bare_q_golf_does_not_trigger_keyword_search` and
`test_bare_q_soccer_uses_playable_field_pitch_futsal_pack`.

The backend also tags each Places-sourced row with a coarse
`confidence` (`high` / `medium` / `low`) based on the playable
classifier (§10.5). Seed rows are tagged `high`. The mobile picker
may surface the band later but **never filters on it** — sparse
areas would otherwise look empty.

### 10.5 Playable venue classifier

**SportsGang searches for playable FACILITIES, not bare sport
keywords.** The Text Search query packs in `_SPORT_STRATEGIES`
(`apps/api/app/services/places.py`) only contain facility nouns —
"golf course", "driving range", "soccer field", "tennis court",
"running track" etc. The bare sport name (`"golf"` / `"soccer"` /
`"basketball"` / `"tennis"` / `"badminton"` / `"running"`) is NEVER
sent to Places. Searching for `"golf"` would return golf retail /
pro shops at the same SKU spend as it returns golf courses; the
classifier would then have to throw them away. We keep retail OUT
of the query in the first place. (Gym is the one exception — the
sport name and the facility noun are identical, so `"gym"` stays
in the gym query pack.)

**Google Places results are still candidates, not automatically
playable venues.** Even a tightly scoped "golf course" query can
return a pro shop that sits next door to a course. The classifier
in `_classify_playability` filters those non-playable candidates
BEFORE they reach mobile.

Quick examples of expected outcomes:

| Candidate | Sport | Outcome |
|---|---|---|
| "Sydney Golf Course" (`golf_course`) | golf | high — survives |
| "Bondi Driving Range" (`golf_course`) | golf | high — survives |
| "Centennial Mini Golf" | golf | medium — survives on allow keyword |
| "Bondi Pitch and Putt" | golf | medium — survives on allow keyword |
| "Big Golf" (no type) | golf | rejected — bare keyword not enough |
| "Big Golf" (`sports_complex`), Nearby-only origin | golf | rejected — golf-strict |
| "Big Golf" (`sports_complex`), surfaced via Text "golf course" | golf | low — query-intent escape; reviewer may downrank |
| "Big Golf" (`store`) | golf | rejected — type is retail (overrides query intent) |
| "Big Golf Pro Shop" (any type) | golf | rejected — "pro shop" keyword (overrides query intent) |
| "Big Golf Warehouse" (`sports_complex`), via Text "golf course" | golf | rejected — global "warehouse" overrides query intent |
| "Concord Golf" (`sports_complex`), via Text "golf course" | golf | low — query-intent escape |
| "Anonymous Park" (Nearby-only) | golf | rejected — golf-strict, no playable query |
| "Golf Warehouse" / "Golf Equipment" / "Golf Fitting" | golf | rejected — global retail keyword |
| "Marrickville Soccer Field" (`athletic_field`) | soccer | high — survives |
| "Bondi Football Pitch" (`athletic_field`) | football | high — survives |
| "Sydney Soccer Apparel Store" | soccer | rejected — global "apparel" |
| "Wentworth Outdoor Basketball Court" (`basketball_court`) | basketball | high — survives |
| "Hoops Basketball Shoes" (`shoe_store`) | basketball | rejected — retail type |
| "Bondi Tennis Court" (`tennis_court`) | tennis | high — survives |
| "Bondi Racquet Stringing" | tennis | rejected — keyword "stringing" |
| "Sydney Running Track" (`athletic_field`) | running | high — survives |
| "The Running Shoe Store" (`store`) | running | rejected — retail type |
| "Anonymous Park" / "Generic Sports Complex" | non-golf | low — plausibility only |

How it works:

- **Hard reject by Google type.** Places whose `primary_type` or any
  `types` entry is `store`, `clothing_store`, `shoe_store`,
  `sporting_goods_store`, or `shopping_mall` are rejected outright.
- **Hard reject by GLOBAL retail keyword in the venue name.**
  These reject regardless of sport:
  `shop`, `store`, `retail`, `pro shop`, `warehouse`, `equipment`,
  `fitting`, `apparel`, `supplement`, `nutrition shop`, `shoe
  store`. Matched with `\b` word boundaries so `shop` does NOT
  reject `workshop` and `store` does NOT reject `bookstore`. This
  is what catches "Tennis Warehouse", "Sydney Supplement Hub",
  "Pro Fitting Studio" etc. across every sport.
- **Hard reject by sport-aware keyword in the venue name.**
  Per-sport reject lists add sport-specific variants on top of the
  global rejects:
  - golf: `pro shop`, `golf shop`, `golf store`, `golf warehouse`,
    `golf equipment`, `golf fitting`, `club fitting`, `lessons`,
    `academy`.
  - tennis: `tennis shop`, `racquet store`, `racket store`,
    `stringing`.
  - badminton: `badminton shop`, `racquet store`, `racket store`.
  - basketball: `basketball shop`, `sneaker store`, `shoes`.
  - gym: `supplement store`, `fitness equipment`, `nutrition shop`.
  - running: `running shop`, `shoes`.
  - soccer / football: `soccer shop`, `football shop`, `shoes`.
- **Score positive signals.** Sport-specific Google type → +3,
  sport-specific allow keyword in NAME → +2, allow keyword in
  ADDRESS → +1. Generic infrastructure (`sports_complex`, `park`,
  `gym`, `stadium`, `sports_club`, `athletic_field`, `playground`,
  `recreation_center`, `city_park`, `fitness_center`) contributes
  a single +1 — `_STRONG_ALLOW_TYPES` and `_MEDIUM_CONFIDENCE_TYPES`
  overlap and are NOT double-counted.
- **Generic infrastructure is plausibility-only.** A row with ONLY
  generic infrastructure evidence — no sport-specific Google type,
  no sport-specific allow keyword in name or address — caps at
  `low`. A random `sports_complex` is not automatically a tennis
  venue; an anonymous park is not automatically a basketball venue.
  Generic types stack as +1 on top of sport-specific evidence.
- **GOLF EXCEPTION — query-intent-aware.** Golf is stricter than
  the other sports for rows with ONLY generic infrastructure
  evidence (`sports_complex`, `park`, `stadium`, `establishment`,
  `point_of_interest`). Golf-specific evidence is one of:
  `golf_course` / `indoor_golf_course` type, or one of "golf
  course" / "golf club" / "driving range" / "golf range" / "mini
  golf" / "putt putt" / "pitch and putt" / "golf links" / "country
  club" / "course" / "links" in the name or address. A golf row
  WITHOUT any of that evidence is REJECTED **unless it surfaced
  via a specific playable Text Search query** ("golf course",
  "driving range", "mini golf", …) — in which case the row carries
  explicit Google keyword-match intent and is surfaced at `low`
  after the retail/pro-shop/store reject paths still run.
  Nearby-only origin (or no origin) is NOT enough to escape the
  reject. Rationale: golf venues have unmistakable terminology and
  anonymous parks / generic sports complexes are overwhelmingly
  non-golf — but real Sydney golf venues that Google doesn't tag
  as `golf_course` (e.g. "Concord Golf" with `sports_complex`)
  used to vanish under blanket rejection, which broke smoke
  coverage. Other sports (basketball, running, badminton) still
  keep low-confidence generic infra for sparse-area coverage and
  ignore matched_query. Pinned by
  `test_generic_infrastructure_is_rejected_for_golf`,
  `test_big_golf_with_sports_complex_type_is_rejected`,
  `test_strict_golf_policy_does_not_apply_to_other_sports`,
  `test_golf_concord_style_survives_via_text_query_origin`,
  `test_golf_big_golf_rejected_with_nearby_only_origin`,
  `test_golf_pro_shop_rejected_even_with_q_golf_course`, and
  `test_golf_retail_keyword_rejected_via_text_query_origin`.

  **Trade-off:** a retail row (e.g. "Big Golf" without an explicit
  "shop"/"warehouse" keyword in the name) returned by Google's
  Text Search for "golf course" will now surface at `low` — the
  classifier cannot distinguish it from a real golf venue with
  similar data shape ("Concord Golf"). Accepted to preserve real-
  venue coverage; the picker confidence band reflects the
  weakness of the evidence.
- **Bands.** `score ≥ 3` → `high`, `score == 2` → `medium`,
  `score == 1` → `low`, `score ≤ 0` → `rejected`.

The bare sport word in a name (e.g. `"golf"` in `"Big Golf"`) is NOT
on its own evidence of a playable venue. This is the explicit fix
for the false positives the previous classifier let through.

**Word-boundary matching.** Reject keywords are matched with `\b`
boundaries, so `shop` does NOT trigger on `workshop` and `store`
does NOT trigger on `bookstore`. Multi-word phrases like
`pro shop` are matched as phrases.

**Rejection logging.** Every rejection emits a `debug`-level log
line `places_playability_rejected sport=<sport> name=<name>
reason=<reason>`. The `reason` is one of `reject_type:<google_type>`,
`reject_keyword:<keyword>`, or `score_too_low`. Names are logged so
the operator can audit drops; addresses and coordinates are NOT
logged.

Why debug, not info: every "Big Golf" / pro shop / shoe store in a
cold-cache search would otherwise fire one info line per row, which
spams production logs. The aggregated per-call summary
`places_hybrid_search … rejected=N` is still emitted at `info` —
that's the right signal for trend / regression monitoring. Bump the
per-row line to `info` only when actively debugging a strategy
regression:

```bash
# Temporary verbose tail when triaging a rejection regression.
fly ssh console --app protin-api -C \
  "python -c 'import logging; logging.getLogger(\"app.services.places\").setLevel(logging.DEBUG)'"
fly logs --app protin-api | grep places_playability_rejected
```

Common false positives the classifier catches:

- Pro shops and golf retail under any `sport=golf` query.
- Racquet stringing services and equipment shops for tennis /
  badminton.
- Apparel / shoe stores searched for a sport keyword (e.g. a
  basketball-branded sneaker store).
- "Lessons" / "academy" — coaching-only businesses where users
  cannot book a session (golf only; coaching is widespread in other
  sports and over-rejecting would hide legitimate clubs).
- Names containing only the sport keyword with no playable
  infrastructure tag — e.g. `"Big Golf"` with no Google type at all.
- Cafes, food venues, and other unrelated businesses that happened
  to surface in a nearby-by-type fan-out.

What it does NOT do:

- Filter by rating, popularity, or opening hours.
- Use any LLM or external classifier.
- Apply different rules to `q`-driven Text Search results — the same
  per-sport allow/reject tables apply.

Tuning notes:

- Tightening `academy` / `lessons` beyond golf can over-filter
  legitimate club venues — keep these scoped per-sport.
- If a real golf course shows up under a "Big Golf"-style name with
  no `golf_course` type from Google, the classifier will reject it.
  The right fix is to flag it to the operator (logged), not to
  loosen the rules — false negatives are cheap, false positives are
  what the user noticed.

---

## 11. Known limitations and follow-ups (non-blocking)

- **No native metric counter on provider outcomes.** Today, success /
  cache-hit / failure can only be inferred from logs + the GCP
  dashboard. Suggested next step: a tiny `prometheus_client` counter
  in `places.py` keyed on `(surface, status)`.
- **In-process cache.** Promote to Redis once multi-instance Fly is in
  play, behind the same `_cache_get` / `_cache_put` helpers.
- **Mobile cannot tell the difference between "quota exceeded" and
  "error" by visual treatment.** The banner copy differs but the
  fallback is identical. Acceptable for v1; revisit if quota events
  become common.
- **No Place Details cache.** Each tap re-fetches. Reasonable while
  the tap rate is low. Add a short Redis TTL keyed on `place_id` if
  the SKU spend becomes visible.
